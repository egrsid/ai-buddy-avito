"""Separate, explicitly synthetic cohort history via business API and local test clock.

No SQL timestamp rewrites and no user volume reset. The clock is a read-only file in
one explicitly configured local backend; it has no public setter. Replays reuse the
completed scenario and do not add assignments/frictions.
"""

import argparse
import json
import re
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path

from scripts.demo import configuration, offline_images_present
from scripts.seed_v4_cohorts import cohort_id
from scripts.v4_live_acceptance import Actor

ROOT = Path(__file__).resolve().parents[1]
DATASET = "v4-cohorts-v1"


def write_clock(directory: Path, at: datetime) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / "clock.json"
    if target.is_file():
        previous = json.loads(target.read_text())
        if previous["dataset"] != DATASET or not previous["synthetic"]:
            raise ValueError("not a synthetic cohort clock")
        if datetime.fromisoformat(previous["now"]) > at:
            raise ValueError("clock rewind forbidden; use a new isolated project")
    temporary = directory / "clock.tmp"
    temporary.write_text(
        json.dumps({"synthetic": True, "dataset": DATASET, "now": at.astimezone(UTC).isoformat()})
        + "\n"
    )
    temporary.chmod(0o644)
    temporary.replace(target)


def setup(project: str, directory: Path, offline: bool | None = None):
    if not re.fullmatch(r"ai-buddy-demo-v4-cohorts(?:-[a-z0-9-]+)?", project):
        raise ValueError("dedicated ai-buddy-demo-v4-cohorts-* project required")
    command, env = configuration(project)
    env.update(
        {
            "FRONTEND_PORT": "15181",
            "BACKEND_PORT": "18088",
            "APP_ORIGIN": "http://localhost:15181",
            "V4_COHORT_CLOCK_DIR": str(directory.resolve()),
        }
    )
    # Cached dependency images exist only on a machine that already built them once;
    # elsewhere the stack is built normally from the network.
    if offline is None:
        offline = offline_images_present()
    if offline:
        command += ["-f", str(ROOT / "compose.offline.yaml")]
    command += ["-f", str(ROOT / "compose.v4-cohorts.yaml")]
    return command, env


def content() -> dict:
    return {
        "title": "Synthetic: сравнение двух версий задания",
        "goal": "Подготовить отчёт о проверках",
        "sections": [
            {
                "id": "report-format",
                "title": "Формат",
                "text": "Опишите результат в свободной форме.",
            }
        ],
        "expected_result": "Отчёт",
        "acceptance_criteria": [{"id": "results", "text": "Перечислены результаты проверок"}],
        "refs": [],
    }


def mark_and_accept(origin: str, buddy: Actor, brief: str, version: int, affected: int, start: int):
    for number in range(start, start + 10):
        assignment = buddy.call(
            "POST",
            "/api/v3/task-assignments",
            {"brief_id": brief, "brief_version": version, "intern_id": cohort_id(number)},
        )
        if number >= start + affected:
            continue
        intern = Actor(origin, f"cohort-{number:02d}")
        try:
            intern.call(
                "POST",
                f"/api/v3/task-assignments/{assignment['id']}/frictions",
                {"section_id": "report-format", "reason": "outcome_unclear"},
            )
        finally:
            intern.close()
    reports = buddy.call("GET", "/api/v3/task-clarity-reports")["items"]
    report = next(r for r in reports if r["brief_id"] == brief and r["brief_version"] == version)
    for decision in ("under_review", "accepted"):
        report = buddy.call(
            "POST",
            f"/api/v3/task-clarity-reports/{report['id']}/review",
            {
                "decision": decision,
                "reason": "Synthetic operator rehearsal",
                "expected_version": report["version"],
            },
        )
    return report


def verify(impact: dict) -> None:
    if (
        impact.get("clock_source") != "synthetic_test_clock"
        or impact["state"] != "ready"
        or impact["before"].get("eligible") != 10
        or impact["before"].get("affected") != 6
        or impact["after"].get("eligible") != 10
        or impact["after"].get("affected") != 2
        or impact.get("delta_pp") != -40
    ):
        raise ValueError("cohort API did not match the independent 10/6, 10/2 oracle")


def populate(origin: str, directory: Path) -> dict:
    manifest = directory / "scenario.json"
    if manifest.is_file():
        result = json.loads(manifest.read_text())
        buddy = Actor(origin, "buddy-a")
        try:
            verify(buddy.call("GET", f"/api/v4/task-briefs/{result['brief_id']}/impact"))
        finally:
            buddy.close()
        return result
    initial = datetime.fromisoformat(json.loads((directory / "clock.json").read_text())["now"])
    buddy = Actor(origin, "buddy-a")
    try:
        brief = buddy.call("POST", "/api/v3/task-briefs", {"content": content()})
        brief = buddy.call(
            "POST",
            f"/api/v3/task-briefs/{brief['id']}/publish",
            {"expected_revision": brief["revision"]},
        )
        report = mark_and_accept(origin, buddy, brief["id"], 1, 6, 1)
        write_clock(directory, initial + timedelta(days=8))
        buddy.close()
        buddy = Actor(origin, "buddy-a")
        current = buddy.call("GET", f"/api/v3/task-briefs/{brief['id']}")
        revised = content()
        revised["sections"][0]["text"] = (
            "Отчёт содержит нумерованный список выполненных проверок и результатов."
        )
        draft = buddy.call(
            "POST",
            f"/api/v3/task-briefs/{brief['id']}/draft",
            {"content": revised, "expected_revision": current["revision"]},
        )
        buddy.call(
            "POST",
            f"/api/v3/task-briefs/{brief['id']}/publish",
            {"expected_revision": draft["revision"]},
        )
        buddy.call(
            "POST",
            f"/api/v3/task-clarity-reports/{report['id']}/review",
            {
                "decision": "resolved",
                "reason": "Synthetic human-published successor",
                "expected_version": report["version"],
                "resolved_version": 2,
            },
        )
        mark_and_accept(origin, buddy, brief["id"], 2, 2, 11)
        write_clock(directory, initial + timedelta(days=16))
        buddy.close()
        buddy = Actor(origin, "buddy-a")

        def stamp(at):
            return at.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

        impact = buddy.call(
            "POST",
            f"/api/v4/task-briefs/{brief['id']}/impact-config",
            {
                "before_version": 1,
                "after_version": 2,
                "section_id": "report-format",
                "reason": "outcome_unclear",
                "comparable": True,
                "expected_revision": 0,
                "from_a": stamp(initial - timedelta(days=1)),
                "to_a": stamp(initial + timedelta(days=1)),
                "from_b": stamp(initial + timedelta(days=7)),
                "to_b": stamp(initial + timedelta(days=9)),
            },
        )
        verify(impact)
        result = {
            "dataset": DATASET,
            "synthetic": True,
            "clock_source": "synthetic_test_clock",
            "brief_id": brief["id"],
            "participants": 20,
            "oracle": {"before": "10/6", "after": "10/2", "delta_pp": -40},
            "actual": impact,
            "status": "passed",
        }
        manifest.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        return result
    finally:
        buddy.close()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("up", "populate", "status", "down"))
    parser.add_argument("--project", default="ai-buddy-demo-v4-cohorts")
    args = parser.parse_args(argv)
    directory = ROOT / ".cache" / args.project
    command, env = setup(args.project, directory)
    if args.action == "up":
        if not (directory / "clock.json").exists():
            write_clock(directory, datetime.now(UTC).replace(microsecond=0) - timedelta(days=16))
        subprocess.run(command + ["up", "--build", "-d", "--wait"], env=env, cwd=ROOT, check=True)
        result = populate(env["APP_ORIGIN"], directory)
        print("Synthetic cohort API:", result["status"], "→", env["APP_ORIGIN"])
    elif args.action == "populate":
        print("Synthetic cohort API:", populate(env["APP_ORIGIN"], directory)["status"])
    else:
        subprocess.run(
            command + (["down"] if args.action == "down" else ["ps", "-a"]),
            env=env,
            cwd=ROOT,
            check=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
