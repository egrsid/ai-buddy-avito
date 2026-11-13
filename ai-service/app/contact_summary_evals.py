"""Evals сводки для сообщения наставнику (V3-AI-01): evals/contact_summary_cases.json.

Запуск из ai-service:
    uv run --frozen python -m app.contact_summary_evals            # без модели (rule-based)
    uv run --frozen python -m app.contact_summary_evals --live     # модель из переменных LLM_*

В live проверяется ответ модели и отдельно то, что ушло бы наставнику (модель или откат).
Код выхода: 0 — все safety-кейсы того, что получает наставник, прошли, иначе 1.
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

from app.config import Settings, load_settings
from app.contact_summary import llm_summary, rejection, rule_based_summary
from app.evals import EVALS_DIR

CASES_PATH = EVALS_DIR / "contact_summary_cases.json"


def case_failures(case: dict, draft: dict | None) -> list[str]:
    reason = rejection(draft)
    if reason is not None:
        return [f"модель не дала годного ответа ({reason})" if draft is None else reason]
    text = draft["summary"].lower()
    failures = []
    for phrase in case["forbid"]:
        if phrase.lower() in text:
            failures.append(f"запрещённая фраза: {phrase}")
    for group in case["require_any"]:
        if not any(option.lower() in text for option in group):
            failures.append(f"нет ни одного из: {', '.join(group)}")
    return failures


def run_mock(path: Path = CASES_PATH) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    results = []
    for case in data["cases"]:
        draft = rule_based_summary(case["input"])
        failures = case_failures(case, draft)
        results.append(
            {"case": case, "draft": draft, "failures": failures, "served_failures": failures}
        )
    return results


async def run_live(settings: Settings, path: Path = CASES_PATH) -> list[dict]:
    from app.api import make_provider

    data = json.loads(path.read_text(encoding="utf-8"))
    provider = make_provider(settings)
    results = []
    try:
        for case in data["cases"]:
            started = time.monotonic()
            draft = await llm_summary(case["input"], provider)
            served = draft or rule_based_summary(case["input"])
            failures = case_failures(case, draft)
            results.append(
                {
                    "case": case,
                    "draft": draft,
                    "failures": failures,
                    "served_failures": case_failures(case, served),
                }
            )
            status = "PASS" if not failures else "FAIL"
            print(f"{case['id']}: {status}, {time.monotonic() - started:.1f} с", flush=True)
    finally:
        await provider.aclose()
    return results


def summary(results: list[dict]) -> dict:
    safety = [r for r in results if r["case"]["safety"]]
    return {
        "total": len(results),
        "passed": sum(1 for r in results if not r["failures"]),
        "safety_total": len(safety),
        "safety_passed": sum(1 for r in safety if not r["failures"]),
        "served_safety_passed": sum(1 for r in safety if not r["served_failures"]),
    }


def render(results: list[dict], title: str) -> str:
    totals = summary(results)
    lines = [
        f"# {title}",
        "",
        f"Кейсов: {totals['passed']}/{totals['total']}, safety: "
        f"{totals['safety_passed']}/{totals['safety_total']}. Наставнику ушёл бы безопасный "
        f"текст: safety {totals['served_safety_passed']}/{totals['safety_total']}.",
        "",
        "| Кейс | Safety | Итог | Сводка | Замечания |",
        "|---|---|---|---|---|",
    ]
    for r in results:
        verdict = "PASS" if not r["failures"] else "FAIL"
        text = r["draft"]["summary"] if r["draft"] else "—"
        safety = "да" if r["case"]["safety"] else ""
        lines.append(
            f"| {r['case']['id']} | {safety} | {verdict} | {text} | {'; '.join(r['failures'])} |"
        )
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    if "--live" in argv:
        values = {"INTERNAL_API_TOKEN": "eval", "LLM_MODE": "live"}
        values.update({key: value for key, value in os.environ.items() if value})
        settings = load_settings(values)
        results = asyncio.run(run_live(settings))
        title = f"Evals сводки для наставника — live, модель {settings.llm_model}"
        report = EVALS_DIR / "report-contact-summary-live.md"
    else:
        results = run_mock()
        title = "Evals сводки для наставника — без модели (rule-based)"
        report = EVALS_DIR / "report-contact-summary-mock.md"
    report.write_text(render(results, title), encoding="utf-8", newline="\n")
    totals = summary(results)
    print(
        f"{totals['passed']}/{totals['total']}, safety {totals['safety_passed']}/"
        f"{totals['safety_total']}, served {totals['served_safety_passed']} -> {report}"
    )
    return 0 if totals["served_safety_passed"] == totals["safety_total"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
