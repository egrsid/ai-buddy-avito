"""Live evals: generate-кейсы evals/cases.json на настоящей модели (LLM_MODE=live).

Запуск из ai-service (нужна модель; по умолчанию локальная Ollama, qwen3.5:9b):
    uv run --frozen python -m app.live_evals [отчёт.md]
Провайдер и модель берутся из тех же переменных, что у сервиса (LLM_PROVIDER, LLM_BASE_URL,
LLM_MODEL, ...). Для платного API каждый вызов идёт через журнал расходов.

Что проверяем: те же свойства, что в mock (права, запрещённый текст во входе и ответе,
tool, схема событий), но дословные фразы mock заменены проверкой по смыслу
(live_required_any). Плюс замеры: первый токен (контракт — 20 с) и весь ответ.
Структурные операции (draft, classify, ...) детерминированы и от модели не зависят —
их проверяет mock-прогон. Кейсы со сбоем X-Mock-Scenario пропускаются: сбои только в mock.

Отчёт — полные ответы для ручного чтения. Код выхода: 0 — safety-кейсы прошли
(качество смотрим в отчёте), 1 — провален safety-кейс, 2 — модель/эмбеддинги недоступны.
"""

import asyncio
import json
import math
import os
import sys
from pathlib import Path

from app.config import Settings, load_settings
from app.contracts import COMMON_SCHEMA_ID, is_valid
from app.evals import CASES_PATH, EVALS_DIR, CaseResult, check_case, run_generate_case
from app.knowledge import load_corpus
from app.redaction import redact
from app.retrieval import KnowledgeBase
from app.vectors import EmbeddingError, embed_corpus

REPORT_PATH = EVALS_DIR / "report-live.md"
DEFAULTS = {
    "INTERNAL_API_TOKEN": "eval",
    "LLM_MODE": "live",
    "LLM_BASE_URL": "http://localhost:11434",
    "LLM_MODEL": "qwen3.5:9b",
}


def live_settings(env: dict) -> Settings:
    values = dict(DEFAULTS)
    values.update({key: value for key, value in env.items() if value})
    return load_settings(values)


def make_factories(settings: Settings):
    """Фабрики клиентов: каждый кейс идёт в своём цикле событий со своими клиентами."""
    from app.api import make_embedder, make_provider

    return (lambda: make_provider(settings)), (lambda: make_embedder(settings))


async def prepare(settings: Settings, make_provider, make_embedder) -> KnowledgeBase:
    """Прогрев модели и векторы корпуса (гибридный поиск, как в live-сервисе)."""
    provider = make_provider()
    embedder = make_embedder()
    try:
        await provider.warm_up()
        documents = load_corpus()
        return KnowledgeBase(documents, await embed_corpus(embedder, documents))
    finally:
        await provider.aclose()
        await embedder.aclose()


def percentile(values: list[float], share: float) -> float | None:
    """Ближайший ранг: p50 — медиана, p95 — почти худший из небольшой выборки."""
    if not values:
        return None
    ordered = sorted(values)
    index = max(math.ceil(share * len(ordered)) - 1, 0)
    return ordered[index]


def selected_cases(data: dict) -> list[dict]:
    cases = []
    for case in data["cases"]:
        if case["operation"] == "generate" and "scenario" not in case:
            cases.append(case)
    return cases


def run_live(
    settings: Settings, make_provider, make_embedder, knowledge: KnowledgeBase, path=CASES_PATH
) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    results = []
    for case in selected_cases(data):
        scope = data["scopes"][case["scope"]]
        if not is_valid("AccessScope", scope, COMMON_SCHEMA_ID):
            raise ValueError(f"scope {case['scope']} не по схеме")
        outcome = run_generate_case(case, scope, knowledge, settings, make_provider, make_embedder)
        failures = check_case(case, scope, outcome, knowledge, live=True)
        results.append(CaseResult(case, outcome, failures))
        status = "PASS" if not failures else "FAIL"
        print(f"{case['id']}: {status}, {outcome.total:.1f} с", flush=True)
    return {"version": data["version"], "results": results, "summary": summarize(results)}


def summarize(results: list[CaseResult]) -> dict:
    safety = [result for result in results if result.case["safety"]]
    first = [r.outcome.first_token for r in results if r.outcome.first_token is not None]
    total = [r.outcome.total for r in results if r.outcome.total is not None]
    return {
        "total": len(results),
        "passed": sum(1 for result in results if result.passed),
        "safety_total": len(safety),
        "safety_passed": sum(1 for result in safety if result.passed),
        "timeouts": sum(1 for r in results if r.outcome.result["failed_code"] == "LLM_TIMEOUT"),
        "unavailable": sum(
            1 for r in results if r.outcome.result["failed_code"] == "LLM_UNAVAILABLE"
        ),
        "first_p50": percentile(first, 0.5),
        "first_p95": percentile(first, 0.95),
        "total_p50": percentile(total, 0.5),
        "total_p95": percentile(total, 0.95),
        "ok": all(result.passed for result in safety),
    }


def seconds(value: float | None) -> str:
    return "—" if value is None else f"{value:.1f} с"


def render_report(run: dict, settings: Settings) -> str:
    summary = run["summary"]
    lines = [
        "# Отчёт live evals AI-сервиса",
        "",
        f"Датасет `{run['version']}`, только generate-кейсы (структурные операции от модели не "
        f"зависят). Провайдер `{settings.llm_provider}`, модель `{settings.llm_model}`, "
        f"эмбеддинги `{settings.embedding_model}`, гибридный поиск. Таймеры контракта: первый "
        "токен 20 с, простой 25 с, весь ответ 85 с.",
        "",
        "Проверки автоматические и грубые (права, запрещённый текст, tool, ключевые слова по "
        "смыслу). Качество объяснений оценивается ручным чтением ответов ниже.",
        "",
        "| Метрика | Значение |",
        "|---|---|",
        f"| Кейсов пройдено | {summary['passed']} / {summary['total']} |",
        f"| Safety пройдено | {summary['safety_passed']} / {summary['safety_total']} |",
        f"| Таймауты LLM_TIMEOUT | {summary['timeouts']} |",
        f"| Недоступность LLM_UNAVAILABLE | {summary['unavailable']} |",
        f"| Первый токен p50 / p95 | {seconds(summary['first_p50'])} / "
        f"{seconds(summary['first_p95'])} |",
        f"| Весь ответ p50 / p95 | {seconds(summary['total_p50'])} / "
        f"{seconds(summary['total_p95'])} |",
        f"| Итог safety | {'OK' if summary['ok'] else 'FAIL'} |",
        "",
        "## Кейсы",
        "",
    ]
    for result in run["results"]:
        case = result.case
        outcome = result.outcome
        status = "PASS" if result.passed else "FAIL"
        safety = ", safety" if case["safety"] else ""
        lines.append(f"### {case['id']} — {status} ({case['category']}{safety})")
        lines.append("")
        lines.append(f"Вопрос: {redact(case['input']['question'])}")
        lines.append("")
        lines.append(
            f"Первый токен: {seconds(outcome.first_token)}, весь ответ: {seconds(outcome.total)}"
        )
        sources = ", ".join(document_id[-2:] for document_id in outcome.retrieved) or "нет"
        tool = outcome.result["tool"]["type"] if outcome.result["tool"] else "нет"
        lines.append(f"Источники (конец UUID): {sources}; tool: {tool}")
        if outcome.result["failed_code"]:
            lines.append(f"run.failed: {outcome.result['failed_code']}")
        for failure in result.failures:
            lines.append(f"- ❌ {failure}")
        lines.extend(["", "> " + outcome.result["text"].replace("\n", "\n> "), ""])
    return "\n".join(lines)


def main(argv: list[str] | None = None, env: dict | None = None, factories=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    env = dict(os.environ) if env is None else env
    report_path = Path(argv[0]) if argv else REPORT_PATH
    settings = live_settings(env)
    make_provider, make_embedder = factories or make_factories(settings)
    try:
        knowledge = asyncio.run(prepare(settings, make_provider, make_embedder))
    except EmbeddingError as error:
        print(f"Эмбеддинги недоступны: {error}", file=sys.stderr)
        return 2
    run = run_live(settings, make_provider, make_embedder, knowledge)
    report_path.write_text(render_report(run, settings), encoding="utf-8")
    summary = run["summary"]
    print(
        f"live evals: {summary['passed']}/{summary['total']} пройдено, safety "
        f"{summary['safety_passed']}/{summary['safety_total']}, таймаутов {summary['timeouts']}, "
        f"первый токен p50 {seconds(summary['first_p50'])}; отчёт: {report_path}"
    )
    if summary["unavailable"] == summary["total"]:
        return 2
    return 0 if summary["ok"] else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
