"""Журнал расходов: резерв до вызова, стоп по порогу, параллель, рестарт, fail closed."""

import math
import threading

import pytest
from app.budget import (
    BudgetLedger,
    BudgetUnavailable,
    cost_rub,
    ensure_ledger,
    init_ledger,
    main,
    upper_tokens,
)


@pytest.fixture
def ledger_path(tmp_path) -> str:
    path = str(tmp_path / "ledger" / "budget.sqlite")
    init_ledger(path)
    return path


def test_cost_is_per_million_tokens():
    assert math.isclose(cost_rub(6000, 96.22) + cost_rub(700, 288.60), 0.77934)


def test_upper_tokens_never_below_utf8_bytes():
    # Кириллица — 2 байта на букву: оценка заведомо не меньше реального числа токенов.
    assert upper_tokens(["абв"]) >= 6
    assert upper_tokens(["a", "b"]) > upper_tokens(["a"])


def test_reserve_then_settle_counts_actual_cost(ledger_path):
    ledger = BudgetLedger(ledger_path, 800)
    reservation = ledger.reserve("chat", 2.0)
    assert ledger.status()["spent_rub"] == 2.0
    assert ledger.settle(reservation, 0.5) is True
    assert ledger.status() == {"spent_rub": 0.5, "calls": 1, "unsettled": 0}


def test_duplicate_settle_is_ignored(ledger_path):
    ledger = BudgetLedger(ledger_path, 800)
    reservation = ledger.reserve("chat", 2.0)
    ledger.settle(reservation, 0.5)
    assert ledger.settle(reservation, 0.1) is False
    assert ledger.status()["spent_rub"] == 0.5


def test_unknown_usage_keeps_reservation_spent(ledger_path):
    # Таймаут/обрыв: settle не было — резерв считается потраченным.
    ledger = BudgetLedger(ledger_path, 800)
    ledger.reserve("chat", 2.0)
    assert ledger.status() == {"spent_rub": 2.0, "calls": 1, "unsettled": 1}


def test_stop_threshold_blocks_before_call(ledger_path):
    ledger = BudgetLedger(ledger_path, 5.0)
    ledger.reserve("chat", 4.0)
    with pytest.raises(BudgetUnavailable):
        ledger.reserve("chat", 1.5)
    # Отказ ничего не записал, а влезающий вызов ещё проходит.
    assert ledger.status()["calls"] == 1
    ledger.reserve("embedding", 1.0)


def test_restart_keeps_spent_money(ledger_path):
    BudgetLedger(ledger_path, 5.0).reserve("chat", 4.0)
    restarted = BudgetLedger(ledger_path, 5.0)
    with pytest.raises(BudgetUnavailable):
        restarted.reserve("chat", 2.0)


def test_parallel_reservations_never_exceed_stop(ledger_path):
    # 20 потоков с отдельными соединениями хотят по 1 ₽ при пороге 10 ₽.
    results = []

    def try_reserve():
        try:
            BudgetLedger(ledger_path, 10.0).reserve("chat", 1.0)
            results.append("ok")
        except BudgetUnavailable:
            results.append("stop")

    threads = [threading.Thread(target=try_reserve) for _ in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert results.count("ok") == 10
    assert BudgetLedger(ledger_path, 10.0).status()["spent_rub"] == 10.0


def test_missing_ledger_fails_closed(tmp_path):
    ledger = BudgetLedger(str(tmp_path / "no-such.sqlite"), 800)
    with pytest.raises(BudgetUnavailable):
        ledger.reserve("chat", 0.1)
    # И не создаёт пустой журнал с нуля.
    assert not (tmp_path / "no-such.sqlite").exists()


def test_corrupt_ledger_fails_closed(tmp_path):
    path = tmp_path / "budget.sqlite"
    path.write_bytes(b"this is not a database at all" * 10)
    ledger = BudgetLedger(str(path), 800)
    with pytest.raises(BudgetUnavailable):
        ledger.reserve("chat", 0.1)
    with pytest.raises(BudgetUnavailable):
        ledger.status()
    assert ledger.settle("any", 0.1) is False


def test_settle_without_ledger_keeps_quiet(tmp_path):
    assert BudgetLedger(str(tmp_path / "gone.sqlite"), 800).settle("any", 0.1) is False


def test_init_refuses_to_reset_existing_ledger(ledger_path):
    with pytest.raises(FileExistsError):
        init_ledger(ledger_path)


def test_cli_init_and_status(tmp_path, capsys):
    path = str(tmp_path / "cli.sqlite")
    assert main(["init", path]) == 0
    assert main(["init", path]) == 1
    BudgetLedger(path, 800).reserve("chat", 1.25)
    assert main(["status"], env={"LLM_BUDGET_LEDGER_PATH": path}) == 0
    assert "1.25 ₽" in capsys.readouterr().out


@pytest.mark.parametrize("argv", [[], ["drop"], ["status"]])
def test_cli_bad_usage(argv):
    assert main(argv, env={}) == 2


def test_cli_status_of_broken_ledger(tmp_path):
    assert main(["status", str(tmp_path / "none.sqlite")]) == 1


def test_ensure_creates_once_and_never_resets(tmp_path, caplog):
    path = str(tmp_path / "volume" / "budget.sqlite")
    with caplog.at_level("WARNING", logger="app.budget"):
        assert ensure_ledger(path) is True
    assert "постоянный том" in caplog.text
    BudgetLedger(path, 800).reserve("chat", 3.0)
    # Рестарт: журнал уже есть — расходы сохраняются.
    assert ensure_ledger(path) is False
    assert BudgetLedger(path, 800).status()["spent_rub"] == 3.0
