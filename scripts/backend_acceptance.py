"""Real Go -> corporate -> PostgreSQL acceptance; AI may be unavailable (safe fallback).

Run only against a fresh isolated v2 dataset. This is API acceptance, not browser or RAG E2E.
"""

import os
from uuid import uuid4

import httpx


class Actor:
    def __init__(self, account):
        self.client = httpx.Client(base_url=os.environ["BACKEND_ACCEPTANCE_URL"], timeout=15)
        self.csrf = ""
        session = self.call("POST", "/auth/demo-login", {"account_id": account})
        self.csrf = session["csrf_token"]

    def call(self, method, path, payload=None):
        response = self.client.request(
            method,
            "/api/v2" + path,
            json=payload,
            headers={
                "Origin": os.environ.get("APP_ORIGIN", "http://localhost:5173"),
                "X-CSRF-Token": self.csrf,
                "Idempotency-Key": str(uuid4()),
            },
        )
        response.raise_for_status()
        return response.json()


def step(goal, name):
    return next(s for s in goal["steps"] if s["id"] == name)


def check(actor, goal, name, ssl=None):
    st = step(goal, name)
    return actor.call(
        "POST",
        f"/goals/{goal['id']}/steps/{name}/checks",
        {
            "method": st["verification_method"],
            "expected_version": st["version"],
            "options": {"ssl_mode": ssl} if ssl else {},
        },
    )


def ai_action(actor, conversation):
    """Exercise real Python -> Go -> public SSE and reread the committed result."""
    run = actor.call(
        "POST",
        f"/conversations/{conversation['id']}/runs",
        {"content": "Подготовь заявку на доступ к тестовой БД"},
    )
    response = actor.client.get(
        f"/api/v2/runs/{run['id']}/events", headers={"Accept": "text/event-stream"}, timeout=90
    )
    response.raise_for_status()
    assert "event: run.completed" in response.text, response.text
    saved = actor.call("GET", f"/runs/{run['id']}")
    assert saved["status"] == "completed" and len(saved["action_ids"]) == 1
    messages = actor.call("GET", f"/conversations/{conversation['id']}/messages")["items"]
    answer = next(m for m in messages if m["id"] == saved["assistant_message_id"])
    assert answer["content"] and answer["status"] == "completed"
    for source in answer["sources"]:
        document = actor.call("GET", "/knowledge/" + source["document_id"])
        assert document["version"] == source["version"]
    action = actor.call("GET", "/actions/" + saved["action_ids"][0])
    assert action["status"] == "pending_confirmation"
    assert action["type"] == "create_access_request"
    assert actor.call("GET", "/access-requests")["items"] == []
    return action


def main():
    approver, buddy, owner = (Actor(a) for a in ("approver-a", "buddy-a", "docs-owner-a"))
    for account in ("intern-a", "intern-b"):
        actor = Actor(account)
        goal = actor.call(
            "POST", "/goals", {"journey_id": "db-access-team-a", "journey_version": 1}
        )
        assert step(goal, "check_access")["status"] == "blocked"
        conversation = actor.call(
            "POST", "/conversations", {"goal_id": goal["id"], "step_id": "check_access"}
        )
        action = (
            ai_action(actor, conversation)
            if os.environ.get("AI_ACCEPTANCE") == "1"
            else actor.call(
                "POST",
                "/actions",
                {
                    "conversation_id": conversation["id"],
                    "goal_id": goal["id"],
                    "step_id": "check_access",
                    "type": "create_access_request",
                    "parameters": {
                        "resource_id": goal["resource_id"],
                        "requested_role": "db_reader",
                        "reason": "Синтетическая интеграционная проверка",
                        "additional_fields": {},
                    },
                },
            )
        )
        action = actor.call("POST", f"/actions/{action['id']}/confirm", {})
        request_id = action["result"]["access_request_id"]
        request = approver.call("GET", "/access-requests/" + request_id)
        assert request["status"] == "submitted" and request["grant_state"] == "absent"
        approver.call(
            "POST",
            f"/access-requests/{request_id}/decision",
            {
                "decision": "approved",
                "reason": "Разрешённый scope",
                "expected_version": request["version"],
            },
        )
        goal = actor.call("GET", "/goals/" + goal["id"])
        assert step(goal, "check_access")["status"] != "verified"
        check(actor, goal, "check_access")
        goal = actor.call("GET", "/goals/" + goal["id"])
        failed = check(actor, goal, "check_connection", "disable")
        assert failed["error_code"] == "DB_SSL_REQUIRED"
        goal = actor.call("GET", "/goals/" + goal["id"])
        # Confirm the exact server-built diagnostic preview.
        conversation = actor.call(
            "POST", "/conversations", {"goal_id": goal["id"], "step_id": "check_connection"}
        )
        block = next(b for b in step(goal, "check_connection")["blockers"] if b["status"] == "open")
        snapshot = {
            "goal": {"id": goal["id"], "title": "DB access"},
            "step": {"id": "check_connection", "title": "Connection"},
            "blocker": {k: block[k] for k in ("id", "type", "error_code")},
            "checks": [],
            "attempted_actions": [],
            "instruction_refs": [],
            "hypotheses": [],
            "question": "Как настроить SSL?",
        }
        action = actor.call(
            "POST",
            "/actions",
            {
                "conversation_id": conversation["id"],
                "goal_id": goal["id"],
                "step_id": "check_connection",
                "type": "escalate_to_buddy",
                "parameters": {"question": snapshot["question"], "diagnostic_snapshot": snapshot},
            },
        )
        preview = action["preview"]["diagnostic_snapshot"]
        action = actor.call("POST", f"/actions/{action['id']}/confirm", {})
        escalation = buddy.call("GET", "/escalations/" + action["result"]["escalation_id"])
        assert escalation["diagnostic_snapshot"] == preview
        buddy.call(
            "POST",
            f"/escalations/{escalation['id']}/reply",
            {"answer": "Включите ssl_mode=require", "expected_version": escalation["version"]},
        )
        goal = actor.call("GET", "/goals/" + goal["id"])
        assert goal["status"] == "blocked"
        check(actor, goal, "check_connection", "require")
        assert actor.call("GET", "/goals/" + goal["id"])["progress"]["percent"] == 100
    candidates = owner.call("GET", "/knowledge-gaps")["items"]
    candidate = next(c for c in candidates if c["error_code"] == "DB_SSL_REQUIRED")
    assert candidate["affected_count"] == 2
    for decision in ("under_review", "accepted"):
        candidate = owner.call(
            "POST",
            f"/knowledge-gaps/{candidate['id']}/review",
            {
                "decision": decision,
                "reason": "Проверено ответственным человеком",
                "expected_version": candidate["version"],
            },
        )
    print(
        "PASS: real Go/corporate/PostgreSQL access -> SSL blocker -> buddy -> verified "
        "-> distinct friction -> reviewed candidate; AI/browser acceptance remains separate."
    )
    if os.environ.get("AI_ACCEPTANCE") == "1":
        print(
            "PASS: real AI generate/SSE, committed message/sources "
            "and exact pending action before confirm."
        )


if __name__ == "__main__":
    main()
