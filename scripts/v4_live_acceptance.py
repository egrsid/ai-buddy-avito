"""Opt-in paid v4 acceptance through Go; reports contain metadata, never prompts/keys.

The free /models preflight must succeed before business calls. Primary completion,
scoped citations, latency and correlated paid usage are separate checks: fallback
cannot pass the primary gate. Run only on a dedicated ai-buddy-live-* project.
"""

import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path
from uuid import uuid4

import httpx

from scripts.live_demo import ROOT, config_problems, configuration, read_env_file

QUESTIONS = (
    "По инструкции команды A объясни, какой режим SSL нужен для подключения к тестовой БД.",
    "По инструкции команды A объясни, почему ssl_mode=disable вызывает DB_SSL_REQUIRED.",
    "По инструкции команды A перечисли безопасные проверки подключения без произвольного SQL.",
    "По инструкции команды A объясни, чем подтверждение заявки отличается от одобрения.",
    "По инструкции команды A объясни, почему факт одобрения нужно подтвердить через IAM.",
    "По инструкции команды A объясни назначение роли db_reader.",
    "По инструкции команды A объясни, что делать при ACCESS_MISSING.",
    "По инструкции команды A объясни, почему ответ AI сам по себе не доказывает доступ.",
    "По инструкции команды A объясни, как исправить ошибку SSL при подключении.",
    "По инструкции команды A объясни, какое доказательство подтверждает успешную проверку БД.",
)


class AcceptanceFailure(Exception):
    pass


class Actor:
    def __init__(self, origin: str, account: str, transport=None):
        self.client = httpx.Client(
            base_url=origin, timeout=15, transport=transport, trust_env=False
        )
        self.csrf = ""
        session = self.call("POST", "/api/v2/auth/demo-login", {"account_id": account})
        self.csrf = session["csrf_token"]

    def call(self, method: str, path: str, body=None, expected: int | None = None):
        result = self.client.request(
            method,
            path,
            **({"json": body} if body is not None else {}),
            headers={
                "Origin": str(self.client.base_url).rstrip("/"),
                "X-CSRF-Token": self.csrf,
                "Idempotency-Key": str(uuid4()),
            },
        )
        if expected is not None:
            return result.status_code == expected
        if not result.is_success:
            raise AcceptanceFailure(f"HTTP_{result.status_code}")
        return result.json()

    def close(self):
        self.client.close()


def catalog(values: dict, transport=None) -> dict:
    """No retries with a bad key; no response error bodies or credentials in output."""
    try:
        with httpx.Client(timeout=8, transport=transport, trust_env=False) as client:
            response = client.get(
                values["LLM_BASE_URL"].rstrip("/") + "/models",
                headers={"Authorization": "Bearer " + values["LLM_API_KEY"]},
            )
            if response.status_code != 200:
                return {"ok": False, "http_status": response.status_code}
            ids = {item["id"] for item in response.json()["data"]}
            names = [values["LLM_MODEL"], values["EMBEDDING_MODEL"]]
            if values.get("LLM_FALLBACK_MODEL"):
                names.append(values["LLM_FALLBACK_MODEL"])
            return {
                "ok": all(name in ids for name in names),
                "models": {name: name in ids for name in names},
            }
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
        return {"ok": False, "error": type(error).__name__}


def ledger_rows(command: list[str], env: dict) -> list[dict]:
    code = (
        "import json,os; from app.budget import BudgetLedger; "
        "print(json.dumps(BudgetLedger(os.environ['LLM_BUDGET_LEDGER_PATH'],0).observations()))"
    )
    result = subprocess.run(
        command + ["exec", "-T", "ai-service", "python", "-c", code],
        env=env,
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


# Go allows 5 chat runs per intern per minute; ten cases must wait instead of failing on 429.
RATE_LIMIT_WAIT_SECONDS = 15
RATE_LIMIT_ATTEMPTS = 6


def start_run(actor: Actor, conversation: str, question: str, sleep=time.sleep) -> dict:
    for attempt in range(RATE_LIMIT_ATTEMPTS):
        try:
            return actor.call(
                "POST", f"/api/v2/conversations/{conversation}/runs", {"content": question}
            )
        except AcceptanceFailure as error:
            if str(error) != "HTTP_429" or attempt == RATE_LIMIT_ATTEMPTS - 1:
                raise
            sleep(RATE_LIMIT_WAIT_SECONDS)
    raise AcceptanceFailure("HTTP_429")


def chat_case(actor: Actor, goal: str, question: str, case_id: str, sleep=time.sleep) -> dict:
    conversation = actor.call(
        "POST", "/api/v2/conversations", {"goal_id": goal, "step_id": "check_access"}
    )
    run = start_run(actor, conversation["id"], question, sleep)
    started = time.monotonic()
    first = None
    event = ""
    # Go answers 422 to an event stream request without this Accept header.
    with actor.client.stream(
        "GET",
        f"/api/v2/runs/{run['id']}/events",
        timeout=90,
        headers={"Accept": "text/event-stream"},
    ) as response:
        if response.status_code != 200:
            raise AcceptanceFailure(f"SSE_HTTP_{response.status_code}")
        for line in response.iter_lines():
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: ") and event == "message.delta" and first is None:
                if json.loads(line[6:]).get("text"):
                    first = time.monotonic() - started
    duration = time.monotonic() - started
    stored = actor.call("GET", f"/api/v2/runs/{run['id']}")
    messages = actor.call("GET", f"/api/v2/conversations/{conversation['id']}/messages")["items"]
    answer = next((m for m in messages if m["id"] == stored.get("assistant_message_id")), {})
    origins = actor.call("GET", f"/api/v3/conversations/{conversation['id']}/message-origins")[
        "items"
    ]
    origin = next((m["origin"] for m in origins if m.get("run_id") == run["id"]), {})
    refs = answer.get("sources", [])
    valid = all(
        actor.call("GET", f"/api/v2/knowledge/{ref['document_id']}")["version"] == ref["version"]
        for ref in refs
    )
    return {
        "case_id": case_id,
        "run_id": run["id"],
        "completion": stored["status"],
        "origin": origin,
        "citation_count": len(refs),
        "citations_reauthorized": valid,
        "first_content_seconds": first,
        "duration_seconds": duration,
    }


def primary_passed(case: dict) -> bool:
    return (
        case["completion"] == "completed"
        and case["origin"].get("answered_by") == "primary"
        and case["origin"].get("completion") == "complete"
        and case["citation_count"] > 0
        and case["citations_reauthorized"]
        and case["first_content_seconds"] is not None
        and case["first_content_seconds"] <= 20
        and case["duration_seconds"] <= 90
        and bool(case.get("usage"))
        and all(row["actual_rub"] is not None for row in case["usage"])
    )


def manifest() -> dict:
    return {
        "kind": "v4_live_acceptance",
        "profile": "actual_paid_through_go",
        "code_revision": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "tree_dirty": bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT)),
        "schema_sha256": {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in (ROOT / "contracts/v4").glob("*.schema.json")
        },
        "clock_source": "server_wall_clock",
        "dataset_revision": None,
        "provider_calls_executed": False,
        "cases": [],
        "status": "blocked",
    }


def run(values: dict, command: list[str], env: dict, count: int, result: dict) -> None:
    result["catalog"] = catalog(values)
    if not result["catalog"]["ok"]:
        return
    before = ledger_rows(command, env)
    last = max((row["rowid"] for row in before), default=0)
    actor = Actor(env["APP_ORIGIN"], "intern-d")
    try:
        goals = actor.call("GET", "/api/v3/goals")["items"]
        own = next((g for g in goals if g["journey_id"] == "db-access-team-a"), None)
        if own is None:
            own = actor.call(
                "POST", "/api/v2/goals", {"journey_id": "db-access-team-a", "journey_version": 1}
            )
        result["goal_id"] = own["id"]
        for index, question in enumerate(QUESTIONS[:count], 1):
            result["provider_calls_executed"] = None
            case = chat_case(actor, own["id"], question, f"primary-{index:02}")
            rows = ledger_rows(command, env)
            case["usage"] = [
                row
                for row in rows
                if row["rowid"] > last and row["correlation_id"] == case["run_id"]
            ]
            result["provider_calls_executed"] = any(row["rowid"] > last for row in rows)
            case["primary_passed"] = primary_passed(case)
            result["cases"].append(case)
            print(case["case_id"], "PASS" if case["primary_passed"] else "FAIL", flush=True)
        result["primary_passed"] = sum(case["primary_passed"] for case in result["cases"])
        result["status"] = "passed" if count == 10 and result["primary_passed"] == 10 else "partial"
        after = ledger_rows(command, env)
        result["provider_calls_executed"] = any(row["rowid"] > last for row in after)
        result["cost_delta_rub"] = sum(
            (r["actual_rub"] if r["actual_rub"] is not None else r["reserved_rub"])
            for r in after
            if r["rowid"] > last
        )
        # Direct ACL regression: same cookie cannot read a team-B instruction.
        result["foreign_document_denied"] = actor.call(
            "GET", "/api/v2/knowledge/0000000d-0000-4000-8000-00000000000d", expected=404
        )
        if not result["foreign_document_denied"]:
            result["status"] = "failed"
    finally:
        actor.close()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.live-v4")
    parser.add_argument("--project", default="ai-buddy-live-v4")
    parser.add_argument("--preflight-only", action="store_true")
    parser.add_argument("--count", type=int, choices=range(1, 11), default=10)
    parser.add_argument("--output", type=Path, default=ROOT / ".cache/v4-live-acceptance.json")
    args = parser.parse_args(argv)
    result = manifest()
    try:
        values = read_env_file(args.env_file)
        problems = config_problems(values)
        if problems:
            result["configuration_errors"] = problems
        else:
            command, env = configuration(args.project, args.env_file)
            if args.preflight_only:
                result["catalog"] = catalog(values)
                result["status"] = "preflight_passed" if result["catalog"]["ok"] else "blocked"
                result["primary_gate"] = "not_run"
            else:
                run(values, command, env, args.count, result)
    except (
        OSError,
        httpx.HTTPError,
        AcceptanceFailure,
        subprocess.SubprocessError,
        ValueError,
        KeyError,
    ) as error:
        result["error"] = type(error).__name__
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print("Live acceptance:", result["status"], "→", args.output)
    return 0 if result["status"] in ("passed", "preflight_passed") else 2


if __name__ == "__main__":
    raise SystemExit(main())
