"""Evals правки ТЗ по отчёту о неясности (V4-EDIT-AI-01): evals/revision_draft_cases.json.

Запуск из ai-service:
    uv run --frozen python -m app.revision_draft_evals            # без модели (шаблон)
    uv run --frozen python -m app.revision_draft_evals --live     # модель из переменных LLM_*

В кейсах нет hash: раннер считает SHA-256 полей и базы сам, как это делает Go.
В live проверяется именно ответ модели: если модель не дала годного ответа, кейс FAIL
(в сервисе ушёл бы шаблон — он проверен mock-прогоном). Платные вызовы — через журнал.

Проверки на каждый кейс: ответ по схеме и смысловым правилам контракта (поле и hash из
запроса, ссылки только разрешённые, без HTML/секретов/инструкций/оценок людей, без новых
фактов в правках); outcome из допустимых для кейса; нет запрещённых фраз; есть нужные.
Отчёт — полные тексты для ручного чтения. Код выхода 1 — провален safety-кейс.
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

from app.config import Settings, load_settings
from app.evals import EVALS_DIR
from app.revision_draft import (
    llm_draft,
    offline_origin,
    request_problems,
    response_problems,
    sha256,
    template_draft,
)

CASES_PATH = EVALS_DIR / "revision_draft_cases.json"
MOCK_ORIGIN = {"mode": "mock", "answered_by": "offline", "reason_code": "config_mock"}


def prepare(raw: dict) -> dict:
    """Тело запроса как от Go: hash каждого поля и базы."""
    body = json.loads(json.dumps(raw))
    for field in body["fields"]:
        field["hash"] = sha256(field["text"])
    body["base_hash"] = sha256(json.dumps(raw["fields"], ensure_ascii=False, sort_keys=True))
    return body


def draft_text(draft: dict) -> str:
    parts = [draft["rationale"]]
    for change in draft["changes"]:
        parts += [change["label"], change["replacement"], change["rationale"]]
    parts += [question["text"] for question in draft["questions"]]
    return "\n".join(parts)


def case_failures(case: dict, body: dict, draft: dict | None) -> list[str]:
    if draft is None:
        return ["модель не дала годного ответа"]
    failures = list(response_problems(body, draft))
    if failures == ["не по схеме"]:
        return failures
    if draft["outcome"] not in case["outcomes"]:
        failures.append(f"outcome {draft['outcome']} не из {case['outcomes']}")
    lower = draft_text(draft).lower()
    for phrase in case["forbid"]:
        if phrase.lower() in lower:
            failures.append(f"запрещённая фраза: {phrase}")
    for group in case["require_any"]:
        if not any(option.lower() in lower for option in group):
            failures.append(f"нет ни одного из: {', '.join(group)}")
    return failures


def load_cases(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    for case in data["cases"]:
        body = prepare(case["input"])
        problems = request_problems(body)
        if problems:
            raise ValueError(f"{case['id']}: кейс не проходит проверку запроса {problems}")
    return data["cases"]


def run_mock(path: Path = CASES_PATH) -> list[dict]:
    results = []
    for case in load_cases(path):
        body = prepare(case["input"])
        draft = template_draft(body, MOCK_ORIGIN)
        results.append({"case": case, "draft": draft, "failures": case_failures(case, body, draft)})
    return results


async def run_live(settings: Settings, path: Path = CASES_PATH) -> list[dict]:
    from app.api import make_provider

    provider = make_provider(settings)
    results = []
    try:
        for case in load_cases(path):
            body = prepare(case["input"])
            started = time.monotonic()
            draft, reason_code = await llm_draft(body, provider)
            seconds = time.monotonic() - started
            failures = case_failures(case, body, draft)
            # Что на самом деле получит автор: ответ модели или явный шаблон сервиса.
            served = draft or template_draft(body, offline_origin(settings, reason_code))
            results.append(
                {
                    "case": case,
                    "draft": draft,
                    "failures": failures,
                    "served_failures": case_failures(
                        {**case, "outcomes": ["ready", "needs_input", "no_change"]}, body, served
                    ),
                    "time": seconds,
                }
            )
            verdict = "PASS" if not failures else "FAIL"
            print(f"{case['id']}: {verdict}, {seconds:.1f} с", flush=True)
    finally:
        await provider.aclose()
    return results


def summary(results: list[dict]) -> dict:
    safety = [r for r in results if r["case"]["safety"]]
    served = [r.get("served_failures", r["failures"]) for r in safety]
    return {
        "total": len(results),
        "passed": sum(1 for r in results if not r["failures"]),
        "safety_total": len(safety),
        "safety_passed": sum(1 for r in safety if not r["failures"]),
        "served_safety_passed": sum(1 for failures in served if not failures),
    }


def render(results: list[dict], title: str) -> str:
    totals = summary(results)
    lines = [
        f"# {title}",
        "",
        f"Кейсов: {totals['passed']}/{totals['total']}, "
        f"safety: {totals['safety_passed']}/{totals['safety_total']}.",
        "",
        "Автору ушёл бы безопасный черновик (ответ модели или явный шаблон после отклонения "
        f"проверкой): safety {totals['served_safety_passed']}/{totals['safety_total']}.",
        "",
        "| Кейс | Safety | Итог | outcome | Замечания |",
        "|---|---|---|---|---|",
    ]
    for r in results:
        verdict = "PASS" if not r["failures"] else "FAIL"
        safety = "да" if r["case"]["safety"] else ""
        outcome = r["draft"]["outcome"] if r["draft"] else "—"
        notes = "; ".join(r["failures"])
        lines.append(f"| {r['case']['id']} | {safety} | {verdict} | {outcome} | {notes} |")
    lines += ["", "## Черновики", ""]
    for r in results:
        case = r["case"]
        lines += [f"### {case['id']}", f"_{case['note']}_", ""]
        for field in case["input"]["fields"]:
            lines.append(f"- было `{field['path']}`: {field['text']}")
        draft = r["draft"]
        if draft is None:
            lines += ["", "Ответа нет.", ""]
            continue
        lines += ["", f"outcome `{draft['outcome']}`, origin `{draft['origin']['answered_by']}`."]
        for change in draft["changes"]:
            lines.append(
                f"- правка `{change['path']}` «{change['label']}»: {change['replacement']}"
            )
            lines.append(f"  - почему: {change['rationale']}")
        for question in draft["questions"]:
            lines.append(f"- вопрос: {question['text']}")
        lines += [f"- обоснование: {draft['rationale']}", ""]
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    live = "--live" in argv
    if live:
        values = {"INTERNAL_API_TOKEN": "eval", "LLM_MODE": "live"}
        values.update({key: value for key, value in os.environ.items() if value})
        settings = load_settings(values)
        results = asyncio.run(run_live(settings))
        title = f"Evals правки ТЗ — live, модель {settings.llm_model}"
        report = EVALS_DIR / "report-revision-draft-live.md"
    else:
        results = run_mock()
        title = "Evals правки ТЗ — без модели (явный шаблон)"
        report = EVALS_DIR / "report-revision-draft-mock.md"
    # В контейнере evals/ только для чтения: live-прогон пишет отчёт по пути из --report.
    if "--report" in argv:
        report = Path(argv[argv.index("--report") + 1])
    report.write_text(render(results, title), encoding="utf-8", newline="\n")
    totals = summary(results)
    print(
        f"{totals['passed']}/{totals['total']}, safety {totals['safety_passed']}/"
        f"{totals['safety_total']} -> {report}"
    )
    return 0 if totals["served_safety_passed"] == totals["safety_total"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
