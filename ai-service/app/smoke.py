"""Smoke платного API (LLM_PROVIDER=openai, Cloud.ru): около 10 платных вызовов.

Запуск из ai-service, переменные — как у сервиса (ключ в LLM_API_KEY, тарифы, журнал):
    uv run --frozen python -m app.smoke [отчёт.md]

Шаги:
1. GET /models (бесплатно): есть ли LLM_MODEL и EMBEDDING_MODEL в каталоге. Нет — стоп
   до платных вызовов.
2. Эмбеддинги: размерность 1024 (иначе нужна новая миграция kb) и usage.
3. Пять generate-кейсов из evals через весь пайплайн: первый токен ≤ 20 с, события по схеме.
4. Отмена потока после первого куска: резерв должен остаться потраченным.
5. Расход по журналу — сверить вручную с биллингом в консоли провайдера.
Коды выхода: 0 — всё ок, 1 — есть провал, 2 — не тот провайдер/конфигурация.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

import httpx

from app.budget import BudgetLedger, ensure_ledger
from app.config import EMBEDDING_DIM, ConfigError, Settings, load_settings
from app.evals import CASES_PATH, EVALS_DIR, run_generate_case, schema_failures
from app.knowledge import load_corpus
from app.openai_provider import make_client
from app.prompt import LlmInput
from app.retrieval import KnowledgeBase
from app.vectors import EmbeddingError, embed_corpus

REPORT_PATH = EVALS_DIR / "report-smoke.md"
SMOKE_CASES = (
    "gen-iam-absent",
    "gen-db-ssl-required",
    "gen-not-evidence",
    "gen-unknown-spt",
    "gen-injection-in-chat",
)
FIRST_TOKEN_LIMIT = 20.0


async def model_ids(settings: Settings, transport=None) -> list[str]:
    client = make_client(settings, 10.0, transport)
    try:
        response = await client.get("/models")
        response.raise_for_status()
        return [item["id"] for item in response.json()["data"]]
    finally:
        await client.aclose()


async def check_embeddings(make_embedder) -> int:
    embedder = make_embedder()
    try:
        vectors = await embedder.embed(["подключение к базе", "заявка на доступ"])
    finally:
        await embedder.aclose()
    return len(vectors[0])


async def corpus_knowledge(make_embedder) -> KnowledgeBase:
    embedder = make_embedder()
    try:
        documents = load_corpus()
        return KnowledgeBase(documents, await embed_corpus(embedder, documents))
    finally:
        await embedder.aclose()


async def cancel_after_first_chunk(make_provider) -> bool:
    """Читает один кусок и обрывает поток, как при таймауте. True — кусок пришёл."""
    provider = make_provider()
    llm_input = LlmInput([{"role": "user", "content": "Расскажи подробно, что такое SSL."}], {}, [])
    stream = provider.stream(llm_input, "normal")
    try:
        await anext(stream)
        return True
    except StopAsyncIteration:
        return False
    finally:
        await stream.aclose()
        await provider.aclose()


def run_smoke(settings: Settings, make_provider, make_embedder, models_transport=None) -> dict:
    checks = []

    def check(name: str, ok: bool, detail: str) -> bool:
        checks.append({"name": name, "ok": ok, "detail": detail})
        print(f"{'OK ' if ok else 'FAIL'} {name}: {detail}", flush=True)
        return ok

    ledger = BudgetLedger(settings.budget_ledger_path, settings.budget_stop_rub)
    spent_before = ledger.status()["spent_rub"]
    measurements = []
    try:
        ids = asyncio.run(model_ids(settings, models_transport))
    except (httpx.HTTPError, KeyError, ValueError) as error:
        check("каталог /models", False, f"не получен: {type(error).__name__}")
        ids = None
    if ids is not None:
        for name in (settings.llm_model, settings.embedding_model):
            check(f"модель {name} в каталоге", name in ids, f"в каталоге {len(ids)} моделей")
    if all(item["ok"] for item in checks):
        try:
            dimension = asyncio.run(check_embeddings(make_embedder))
            check("размерность эмбеддингов", dimension == EMBEDDING_DIM, str(dimension))
            knowledge = asyncio.run(corpus_knowledge(make_embedder))
        except EmbeddingError as error:
            check("эмбеддинги", False, str(error))
            knowledge = None
        if knowledge is not None:
            data = json.loads(CASES_PATH.read_text(encoding="utf-8"))
            for case in data["cases"]:
                if case["id"] not in SMOKE_CASES:
                    continue
                scope = data["scopes"][case["scope"]]
                outcome = run_generate_case(
                    case, scope, knowledge, settings, make_provider, make_embedder
                )
                measurements.append({"id": case["id"], "first": outcome.first_token})
                first = outcome.first_token
                failed = outcome.result["failed_code"]
                ok = first is not None and first <= FIRST_TOKEN_LIMIT and not failed
                detail = f"первый токен {first:.1f} с" if first is not None else f"{failed}"
                check(f"generate {case['id']}", ok, detail)
                bad = schema_failures(case, outcome)
                check(f"схема событий {case['id']}", not bad, "; ".join(bad) or "ок")
            unsettled_before = ledger.status()["unsettled"]
            got_chunk = asyncio.run(cancel_after_first_chunk(make_provider))
            unsettled_after = ledger.status()["unsettled"]
            check(
                "отмена потока оставляет резерв",
                got_chunk and unsettled_after == unsettled_before + 1,
                f"без факта было {unsettled_before}, стало {unsettled_after}",
            )
    status = ledger.status()
    return {
        "checks": checks,
        "measurements": measurements,
        "spent_rub": status["spent_rub"] - spent_before,
        "ledger": status,
        "ok": all(item["ok"] for item in checks),
    }


def render_report(result: dict, settings: Settings) -> str:
    lines = [
        "# Smoke платного API",
        "",
        f"Провайдер `{settings.llm_provider}`, модель `{settings.llm_model}`, эмбеддинги "
        f"`{settings.embedding_model}`. Тарифы, ₽ за 1 млн токенов: вход "
        f"{settings.price_input_rub}, выход {settings.price_output_rub}, эмбеддинги "
        f"{settings.price_embedding_rub}.",
        "",
        "| Проверка | Итог | Детали |",
        "|---|---|---|",
    ]
    for item in result["checks"]:
        lines.append(f"| {item['name']} | {'OK' if item['ok'] else 'FAIL'} | {item['detail']} |")
    ledger = result["ledger"]
    lines += [
        "",
        f"Потрачено за smoke по журналу: {result['spent_rub']:.4f} ₽. Всего в журнале "
        f"{ledger['spent_rub']:.4f} ₽ за {ledger['calls']} вызовов, без фактической цены "
        f"(резерв): {ledger['unsettled']}.",
        "",
        "Сверить с биллингом в консоли провайдера и записать расхождение сюда вручную.",
        "",
    ]
    return "\n".join(lines)


def main(argv=None, env=None, factories=None, models_transport=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    env = dict(os.environ) if env is None else env
    report_path = Path(argv[0]) if argv else REPORT_PATH
    try:
        settings = load_settings({"INTERNAL_API_TOKEN": "smoke", **env})
    except ConfigError as error:
        print(f"Конфигурация: {error}", file=sys.stderr)
        return 2
    if settings.llm_mode != "live" or settings.llm_provider != "openai":
        print("Smoke только для LLM_MODE=live и LLM_PROVIDER=openai", file=sys.stderr)
        return 2
    if factories is None:
        from app.live_evals import make_factories

        factories = make_factories(settings)
    make_provider, make_embedder = factories
    ensure_ledger(settings.budget_ledger_path)
    result = run_smoke(settings, make_provider, make_embedder, models_transport)
    report_path.write_text(render_report(result, settings), encoding="utf-8")
    print(f"smoke: {'OK' if result['ok'] else 'FAIL'}, отчёт: {report_path}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
