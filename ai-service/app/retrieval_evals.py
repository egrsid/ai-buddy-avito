"""Замер поиска: лексика против гибрида на настоящих векторах (bge-m3 через Ollama).

Запуск из ai-service (нужна Ollama): uv run --frozen python -m app.retrieval_evals [отчёт.md]
LLM_BASE_URL по умолчанию http://localhost:11434. Отчёт: evals/report-retrieval.md.

Метрики: нужный документ на 1-м месте и в top-3 (столько фрагментов идёт в промпт generate).
Вопросы: evals/retrieval_cases.json (перефразировки и коды) + generate-кейсы из cases.json.
Порога качества нет — это замер для выбора, а не тест. Safety — есть: если гибрид вернул
документ вне прав, код выхода 1. Коды: 0 — ок, 1 — утечка, 2 — эмбеддинги недоступны.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from app.acl import can_read
from app.config import Settings
from app.evals import CASES_PATH, EVALS_DIR, generate_request
from app.generate import GENERATE_TOP_K, search_query
from app.knowledge import load_corpus
from app.redaction import redact
from app.retrieval import KnowledgeBase
from app.vectors import EmbeddingError, embed_corpus

RETRIEVAL_CASES_PATH = EVALS_DIR / "retrieval_cases.json"
REPORT_PATH = EVALS_DIR / "report-retrieval.md"


def load_cases() -> tuple[dict, list[dict]]:
    """Скоупы и вопросы: свои кейсы + generate-кейсы evals с ожидаемым источником."""
    main_cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    scopes = main_cases["scopes"]
    cases = json.loads(RETRIEVAL_CASES_PATH.read_text(encoding="utf-8"))["cases"]
    for case in main_cases["cases"]:
        expected = case["expect"].get("expected_sources")
        if case["operation"] != "generate" or not expected:
            continue
        request = generate_request(case["input"], scopes[case["scope"]])
        cases.append(
            {
                "id": case["id"],
                "scope": case["scope"],
                "query": search_query(request),
                "expected": expected[0],
            }
        )
    return scopes, cases


def document_ids(hits) -> list[str]:
    return [hit.document.id for hit in hits]


async def compare(scopes: dict, cases: list[dict], embedder) -> list[dict]:
    documents = load_corpus()
    lexical = KnowledgeBase(documents)
    hybrid = KnowledgeBase(documents, await embed_corpus(embedder, documents))
    rows = []
    for case in cases:
        scope = scopes[case["scope"]]
        query_vector = (await embedder.embed([redact(case["query"])]))[0]
        found_lexical = document_ids(lexical.search(scope, case["query"], GENERATE_TOP_K))
        found_hybrid = document_ids(
            hybrid.search(scope, case["query"], GENERATE_TOP_K, query_vector)
        )
        leaks = [doc for doc in found_hybrid if not can_read(scope, hybrid.documents[doc])]
        rows.append({**case, "lexical": found_lexical, "hybrid": found_hybrid, "leaks": leaks})
    return rows


def summarize(rows: list[dict]) -> dict:
    summary = {"total": len(rows), "leaks": sum(len(row["leaks"]) for row in rows)}
    for method in ("lexical", "hybrid"):
        summary[f"{method}_top1"] = sum(1 for row in rows if row[method][:1] == [row["expected"]])
        summary[f"{method}_top3"] = sum(1 for row in rows if row["expected"] in row[method])
    return summary


def place(found: list[str], expected: str) -> str:
    if expected in found:
        return str(found.index(expected) + 1)
    return "—"


def render_report(rows: list[dict], summary: dict, model: str) -> str:
    total = summary["total"]
    lines = [
        "# Отчёт retrieval: лексика против гибрида",
        "",
        f"Корпус `data/knowledge/v2`, эмбеддинги `{model}` (Ollama, CPU), top-{GENERATE_TOP_K} "
        "(столько фрагментов идёт в промпт). Гибрид — RRF лексического и векторного списков.",
        "",
        "| Метрика | Лексика | Гибрид |",
        "|---|---|---|",
        f"| Нужный документ 1-м | {summary['lexical_top1']} / {total} | "
        f"{summary['hybrid_top1']} / {total} |",
        f"| Нужный документ в top-{GENERATE_TOP_K} | {summary['lexical_top3']} / {total} | "
        f"{summary['hybrid_top3']} / {total} |",
        f"| Документы вне прав (safety) | — | {summary['leaks']} |",
        "",
        "## Вопросы",
        "",
        "Место нужного документа в выдаче («—» — не найден).",
        "",
        "| Кейс | Вопрос | Лексика | Гибрид |",
        "|---|---|---|---|",
    ]
    for row in rows:
        query = redact(row["query"]).replace("|", "/")
        lexical = place(row["lexical"], row["expected"])
        hybrid = place(row["hybrid"], row["expected"])
        lines.append(f"| {row['id']} | {query} | {lexical} | {hybrid} |")
    return "\n".join(lines) + "\n"


def make_embedder(settings: Settings):
    from app.embeddings import OllamaEmbedder

    return OllamaEmbedder(settings)


async def measure(scopes: dict, cases: list[dict], embedder) -> list[dict]:
    try:
        return await compare(scopes, cases, embedder)
    finally:
        await embedder.aclose()


def main(argv: list[str] | None = None, embedder_factory=make_embedder) -> int:
    argv = sys.argv[1:] if argv is None else argv
    report_path = Path(argv[0]) if argv else REPORT_PATH
    settings = Settings(
        internal_api_token="not-used",
        llm_mode="live",
        llm_base_url=os.environ.get("LLM_BASE_URL") or "http://localhost:11434",
        llm_model="not-used",
        embedding_model=os.environ.get("EMBEDDING_MODEL") or "bge-m3",
    )
    scopes, cases = load_cases()
    try:
        rows = asyncio.run(measure(scopes, cases, embedder_factory(settings)))
    except EmbeddingError as error:
        print(f"Эмбеддинги недоступны: {error}", file=sys.stderr)
        return 2
    summary = summarize(rows)
    report_path.write_text(render_report(rows, summary, settings.embedding_model), "utf-8")
    print(
        f"retrieval: лексика top1 {summary['lexical_top1']}/{summary['total']}, "
        f"top{GENERATE_TOP_K} {summary['lexical_top3']}; гибрид top1 {summary['hybrid_top1']}, "
        f"top{GENERATE_TOP_K} {summary['hybrid_top3']}; утечек {summary['leaks']}; "
        f"отчёт: {report_path}"
    )
    return 1 if summary["leaks"] else 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
