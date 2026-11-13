"""Учёт расходов на платный LLM API (бюджет хакатона 1000 ₽, автостоп 800 ₽).

Правило: деньги резервируются ДО вызова провайдера по верхней оценке цены, а после
ответа резерв заменяется фактической ценой из usage. Если usage не пришёл (таймаут,
обрыв, провайдер не прислал), резерв так и остаётся потраченным: лучше переоценить
расход, чем недосчитать.

Журнал — файл SQLite на постоянном томе. Транзакция BEGIN IMMEDIATE берёт блокировку
на запись, поэтому два запроса или два процесса не займут одни и те же деньги.
Журнал создаётся при старте сервиса/ingest, если его ещё нет (первый запуск; громкое
предупреждение в лог), или командой init. Пропал или повреждён после старта — платные
вызовы запрещены (fail closed): во время работы журнал заново с нуля не начинается.
Чтобы рестарт не обнулял расходы, путь должен лежать на постоянном томе.

CLI (из ai-service):
    uv run --frozen python -m app.budget init [путь]    — создать пустой журнал
    uv run --frozen python -m app.budget status [путь]  — сколько потрачено
Путь по умолчанию — из LLM_BUDGET_LEDGER_PATH.
"""

import logging
import os
import sqlite3
import sys
import time
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)
# Запас токенов на служебную разметку каждого сообщения чата (роль, разделители).
MESSAGE_OVERHEAD_TOKENS = 16
# Сколько ждать блокировку журнала, пока его держит другой запрос.
LOCK_TIMEOUT = 10.0
SCHEMA = """
CREATE TABLE reservations (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    reserved_rub REAL NOT NULL,
    actual_rub REAL,
    created_at REAL NOT NULL,
    settled_at REAL
)
"""
# Потрачено = фактическая цена, а где её нет — резерв.
SPENT_SQL = "SELECT COALESCE(SUM(COALESCE(actual_rub, reserved_rub)), 0) FROM reservations"


class BudgetUnavailable(Exception):
    """Платный вызов запрещён: бюджет исчерпан или журнал недоступен."""


def cost_rub(tokens: int, rub_per_million: float) -> float:
    return tokens * rub_per_million / 1_000_000


def upper_tokens(texts: list[str]) -> int:
    """Верхняя оценка числа токенов без токенизатора — байты UTF-8.

    Токен словаря модели занимает минимум один байт, поэтому токенов не больше байтов.
    Для русского текста это примерно втрое больше реального: резерв с запасом.
    """
    return sum(len(text.encode("utf-8")) + MESSAGE_OVERHEAD_TOKENS for text in texts)


def ledger_uri(path: str) -> str:
    # mode=rw: если файла нет, SQLite вернёт ошибку, а не создаст новый пустой журнал.
    return Path(path).resolve().as_uri() + "?mode=rw"


class BudgetLedger:
    def __init__(self, path: str, stop_rub: float):
        self.path = path
        self.stop_rub = stop_rub

    def connect(self) -> sqlite3.Connection:
        try:
            # isolation_level=None: транзакциями управляем сами (BEGIN IMMEDIATE / COMMIT).
            return sqlite3.connect(
                ledger_uri(self.path), uri=True, timeout=LOCK_TIMEOUT, isolation_level=None
            )
        except sqlite3.Error as error:
            raise BudgetUnavailable("журнал расходов недоступен") from error

    def reserve(self, kind: str, amount_rub: float) -> str:
        """Резервирует amount_rub или бросает BudgetUnavailable. Возвращает id резерва."""
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            spent = connection.execute(SPENT_SQL).fetchone()[0]
            if spent + amount_rub > self.stop_rub:
                connection.execute("ROLLBACK")
                logger.warning("Бюджет: потрачено %.2f ₽, стоп %.2f ₽", spent, self.stop_rub)
                raise BudgetUnavailable("достигнут порог расходов")
            reservation_id = str(uuid.uuid4())
            connection.execute(
                "INSERT INTO reservations (id, kind, reserved_rub, created_at) VALUES (?, ?, ?, ?)",
                (reservation_id, kind, amount_rub, time.time()),
            )
            connection.execute("COMMIT")
            return reservation_id
        except sqlite3.Error as error:
            raise BudgetUnavailable("журнал расходов недоступен или повреждён") from error
        finally:
            # Без COMMIT закрытие соединения откатывает начатую транзакцию.
            connection.close()

    def settle(self, reservation_id: str, actual_rub: float) -> bool:
        """Записывает фактическую цену. Повторный settle того же резерва ничего не меняет."""
        try:
            connection = self.connect()
        except BudgetUnavailable:
            logger.warning("Бюджет: факт не записан, журнал недоступен; резерв остаётся")
            return False
        try:
            cursor = connection.execute(
                "UPDATE reservations SET actual_rub = ?, settled_at = ? "
                "WHERE id = ? AND actual_rub IS NULL",
                (actual_rub, time.time(), reservation_id),
            )
            if cursor.rowcount == 0:
                logger.warning("Бюджет: резерв уже закрыт или не найден, повтор пропущен")
                return False
            return True
        except sqlite3.Error:
            logger.warning("Бюджет: факт не записан, журнал повреждён; резерв остаётся")
            return False
        finally:
            connection.close()

    def status(self) -> dict:
        connection = self.connect()
        try:
            spent = connection.execute(SPENT_SQL).fetchone()[0]
            calls = connection.execute("SELECT COUNT(*) FROM reservations").fetchone()[0]
            open_count = connection.execute(
                "SELECT COUNT(*) FROM reservations WHERE actual_rub IS NULL"
            ).fetchone()[0]
        except sqlite3.Error as error:
            raise BudgetUnavailable("журнал расходов недоступен или повреждён") from error
        finally:
            connection.close()
        return {"spent_rub": spent, "calls": calls, "unsettled": open_count}


def init_ledger(path: str) -> None:
    """Создаёт пустой журнал. Существующий не трогает: обнулить расходы так нельзя."""
    if Path(path).exists():
        raise FileExistsError(path)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    try:
        connection.execute(SCHEMA)
        connection.commit()
    finally:
        connection.close()


def ensure_ledger(path: str) -> bool:
    """Создаёт журнал, если его нет. True — создан новый (это видно в логе)."""
    try:
        init_ledger(path)
    except FileExistsError:
        return False
    logger.warning(
        "Создан новый журнал расходов %s: если это не первый запуск, проверьте постоянный том",
        path,
    )
    return True


def main(argv: list[str] | None = None, env: dict | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    env = os.environ if env is None else env
    if not argv or argv[0] not in ("init", "status"):
        print("Использование: python -m app.budget init|status [путь]", file=sys.stderr)
        return 2
    path = argv[1] if len(argv) > 1 else env.get("LLM_BUDGET_LEDGER_PATH", "")
    if not path:
        print("Не задан путь журнала (LLM_BUDGET_LEDGER_PATH)", file=sys.stderr)
        return 2
    if argv[0] == "init":
        try:
            init_ledger(path)
        except FileExistsError:
            print(f"Журнал уже есть, не трогаю: {path}", file=sys.stderr)
            return 1
        print(f"Журнал расходов создан: {path}")
        return 0
    try:
        status = BudgetLedger(path, 0).status()
    except BudgetUnavailable as error:
        print(f"Журнал не читается: {error}", file=sys.stderr)
        return 1
    print(
        f"Потрачено {status['spent_rub']:.2f} ₽ за {status['calls']} вызовов, "
        f"без фактической цены (резерв): {status['unsettled']}"
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
