"""Exercise real corporate persistence and the internal auth/schema boundary."""

import os
from uuid import uuid4

import psycopg
import pytest
from corporate.service import create_app
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

SUBJECT = "10000000-0000-4000-8000-000000000003"
APPROVER = "10000000-0000-4000-8000-000000000006"
RESOURCE = "db-team-a-test"


@pytest.fixture
def factory():
    dsn = os.environ.get("MOCK_TEST_DSN")
    if not dsn:
        pytest.fail("Set MOCK_TEST_DSN to the isolated corporate test database")
    assert "test" in psycopg.conninfo.conninfo_to_dict(dsn)["dbname"]

    def connect():
        return psycopg.connect(dsn, row_factory=dict_row)

    with psycopg.connect(os.environ["MOCK_TEST_ADMIN_DSN"]) as db:
        db.execute(
            "TRUNCATE corporate.access_requests,corporate.decisions,corporate.check_results,"
            "corporate.connection_checks,corporate.iam_grants CASCADE"
        )
    return lambda **kw: TestClient(create_app(connect, "test-token", **kw))


def headers(**kw):
    return {"Authorization": "Bearer test-token", "X-Request-ID": str(uuid4()), **kw}


def call(client, method, path, data=None, expected=200, extra=None):
    response = client.request(
        method, "/internal/v2" + path, json=data, headers=headers(**(extra or {}))
    )
    assert response.status_code == expected, response.text
    return response.json()


def new_request(client, **kw):
    data = {
        "operation_key": str(uuid4()),
        "subject_id": SUBJECT,
        "resource_id": RESOURCE,
        "requested_role": "db_reader",
        "reason": "Тестовая заявка",
        **kw,
    }
    return data, call(
        client, "POST", "/access-requests", data, 201, {"Idempotency-Key": data["operation_key"]}
    )


def probe(client, method="iam", subject=SUBJECT, ssl="disable", **kw):
    data = {"check_id": str(uuid4()), "subject_id": subject, "resource_id": RESOURCE, **kw}
    if method == "iam":
        data["requested_role"] = "db_reader"
    else:
        data["options"] = {"ssl_mode": ssl}
    return data, call(
        client, "POST", "/iam/access-checks" if method == "iam" else "/db/connection-checks", data
    )


def test_auth_precedence(factory):
    c = factory()
    assert c.get("/healthz").status_code == 200
    assert c.get("/readyz").status_code == 200
    for auth, request_id, content, code in [
        (False, False, "{", 401),
        (True, False, "{", 400),
        (True, True, "{", 400),
        (True, True, "[]", 422),
        (True, True, "{}", 422),
    ]:
        h = headers() if auth else {}
        if not request_id:
            h.pop("X-Request-ID", None)
        assert (
            c.post("/internal/v2/access-requests", content=content, headers=h).status_code == code
        )
    h = headers()
    h["X-Request-ID"] = "invalid"
    assert c.get("/internal/v2/resources", headers=h).status_code == 400
    assert len(call(c, "GET", "/resources")["items"]) == 3


def test_full_request_and_checks(factory):
    c = factory()
    _, before = probe(c)
    assert before["grant_state"] == "absent"
    _, denied = probe(c, "db")
    assert denied["error_code"] == "ACCESS_DENIED"
    payload, req = new_request(c)
    same = call(
        c, "POST", "/access-requests", payload, 201, {"Idempotency-Key": payload["operation_key"]}
    )
    assert same == req
    call(
        c,
        "POST",
        "/access-requests",
        {**payload, "reason": "changed"},
        409,
        {"Idempotency-Key": payload["operation_key"]},
    )
    call(c, "POST", "/access-requests", payload, 422)
    assert call(c, "GET", "/access-requests/by-operation/" + payload["operation_key"]) == req
    assert call(c, "GET", "/access-requests/" + req["mock_id"]) == req
    decision = {
        "decision": "approved",
        "approver_id": SUBJECT,
        "reason": "ok",
        "operation_key": str(uuid4()),
    }
    path = "/access-requests/" + req["mock_id"] + "/decision"
    call(c, "POST", path, decision, 403)
    decision["approver_id"] = APPROVER
    approved = call(c, "POST", path, decision)
    assert approved["status"] == "approved" and approved["grant_state"] == "present"
    assert call(c, "POST", path, decision) == approved
    call(c, "POST", path, {**decision, "reason": "changed"}, 409)
    call(c, "POST", path, {**decision, "operation_key": str(uuid4())}, 409)
    _, iam = probe(c)
    assert iam["grant_state"] == "present"
    data, ssl = probe(c, "db")
    assert ssl["error_code"] == "DB_SSL_REQUIRED"
    assert call(c, "POST", "/db/connection-checks", data) == ssl
    assert call(c, "GET", "/checks/by-operation/" + data["check_id"]) == ssl
    call(c, "POST", "/db/connection-checks", {**data, "options": {"ssl_mode": "require"}}, 409)
    data, passed = probe(c, "db", ssl="require")
    assert passed["outcome"] == "passed" and "error_code" not in passed
    data, iam = probe(c)
    assert call(c, "GET", "/checks/by-operation/" + data["check_id"]) == iam
    assert call(c, "POST", "/iam/access-checks", data) == iam
    call(c, "POST", "/iam/access-checks", {**data, "subject_id": APPROVER}, 409)
    restarted = factory()
    assert call(restarted, "GET", "/access-requests/" + req["mock_id"]) == approved


def test_approval_without_grant_and_reject(factory):
    c = factory(grant_on_approval=False)
    _, req = new_request(c)
    decision = {
        "decision": "approved",
        "approver_id": APPROVER,
        "reason": "reviewed",
        "operation_key": str(uuid4()),
    }
    assert (
        call(c, "POST", "/access-requests/" + req["mock_id"] + "/decision", decision)["grant_state"]
        == "pending"
    )
    assert probe(c)[1]["grant_state"] == "absent"
    assert probe(c, "db", ssl="require")[1]["outcome"] == "failed"
    _, req = new_request(c)
    assert (
        call(
            c,
            "POST",
            "/access-requests/" + req["mock_id"] + "/decision",
            {**decision, "decision": "rejected", "operation_key": str(uuid4())},
        )["status"]
        == "rejected"
    )


def test_closed_options_not_found_and_unrequestable(factory):
    c = factory()
    data = {
        "check_id": str(uuid4()),
        "subject_id": SUBJECT,
        "resource_id": RESOURCE,
        "options": {"ssl_mode": "require", "sql": "SELECT 1"},
    }
    call(c, "POST", "/db/connection-checks", data, 422)
    for path in [
        "/access-requests/" + str(uuid4()),
        "/access-requests/by-operation/" + str(uuid4()),
        "/access-requests/by-operation/bad",
        "/checks/by-operation/bad",
        "/checks/by-operation/" + str(uuid4()),
    ]:
        call(c, "GET", path, expected=404)
    call(
        c,
        "POST",
        "/access-requests/" + str(uuid4()) + "/decision",
        {
            "decision": "rejected",
            "approver_id": APPROVER,
            "reason": "test",
            "operation_key": str(uuid4()),
        },
        404,
    )
    for resource, status in [("db-restricted", 422), ("unknown", 404)]:
        key = str(uuid4())
        call(
            c,
            "POST",
            "/access-requests",
            {
                "operation_key": key,
                "subject_id": SUBJECT,
                "resource_id": resource,
                "requested_role": "db_reader",
                "reason": "test",
            },
            status,
            {"Idempotency-Key": key},
        )


def test_missing_configuration_and_ready_failure(monkeypatch):
    monkeypatch.delenv("INTERNAL_API_TOKEN", raising=False)
    with pytest.raises(ValueError):
        create_app()

    def broken():
        raise psycopg.OperationalError("offline")

    assert TestClient(create_app(broken, "test-token")).get("/readyz").status_code == 503
