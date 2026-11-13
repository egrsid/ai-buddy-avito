"""Persistent, synthetic corporate API. No application or knowledge schema access."""

import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from jsonschema import Draft202012Validator, FormatChecker
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[2]


class Rejected(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code


def create_app(connect=None, token=None, grant_on_approval=True):
    connect = connect or (lambda: psycopg.connect(row_factory=dict_row))
    token = token or os.environ.get("INTERNAL_API_TOKEN", "")
    if not token:
        raise ValueError("INTERNAL_API_TOKEN required")
    documents = [
        json.loads((ROOT / f"contracts/v2/{n}.schema.json").read_text())
        for n in ("common", "corporate")
    ]
    registry = Registry().with_resources((d["$id"], Resource.from_contents(d)) for d in documents)
    validators = {
        n: Draft202012Validator(v, registry=registry, format_checker=FormatChecker())
        for n, v in documents[1]["$defs"].items()
    }
    # Relative references in defs need their owning resource's base URI.
    validators = {
        n: Draft202012Validator(
            {"$ref": documents[1]["$id"] + "#/$defs/" + n},
            registry=registry,
            format_checker=FormatChecker(),
        )
        for n in validators
    }
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(Rejected)
    async def rejected(request, exc):
        rid = request.headers.get("X-Request-ID", "")
        try:
            parsed = UUID(rid)
            if parsed.version != 4 or str(parsed) != rid:
                raise ValueError()
        except ValueError:
            rid = str(uuid4())
        return JSONResponse(
            {"error": {"code": exc.code, "message": exc.code, "request_id": rid}},
            status_code=exc.status,
            headers={"X-Request-ID": rid},
        )

    @app.exception_handler(psycopg.Error)
    async def database_error(request, exc):
        return await rejected(request, Rejected(503, "UPSTREAM_ERROR"))

    async def body(request, definition=None):
        if not hmac.compare_digest(request.headers.get("Authorization", ""), "Bearer " + token):
            raise Rejected(401, "UNAUTHENTICATED")
        ids = request.headers.getlist("X-Request-ID")
        try:
            if len(ids) != 1 or UUID(ids[0]).version != 4 or str(UUID(ids[0])) != ids[0]:
                raise ValueError()
        except (ValueError, IndexError):
            raise Rejected(400, "INVALID_REQUEST_ID") from None
        if definition is None:
            return None
        try:
            raw = await request.body()
            if len(raw) > 65536:
                raise ValueError()
            data = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            raise Rejected(400, "INVALID_JSON") from None
        if not validators[definition].is_valid(data):
            raise Rejected(422, "VALIDATION_ERROR")
        return data

    def result(request, definition, value, status=200):
        if not validators[definition].is_valid(value):
            raise Rejected(502, "UPSTREAM_ERROR")
        return JSONResponse(
            value,
            status_code=status,
            headers={"X-Request-ID": request.headers["X-Request-ID"], "Cache-Control": "no-store"},
        )

    def timestamp():
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def fingerprint(data):
        return hashlib.sha256(
            json.dumps(data, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()

    def lock(db, key):
        db.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (key,))

    def record(row):
        return {
            "mock_id": row["mock_id"],
            "operation_key": str(row["operation_key"]),
            "status": row["status"],
            "grant_state": row["grant_state"],
            "synthetic": True,
        }

    def resource(db, rid):
        row = db.execute(
            "SELECT * FROM corporate.resources WHERE resource_id=%s", (rid,)
        ).fetchone()
        if not row:
            raise Rejected(404, "NOT_FOUND")
        return row

    def grant(db, subject, rid):
        row = db.execute(
            "SELECT grant_state FROM corporate.iam_grants WHERE subject_id=%s AND "
            "resource_id=%s AND granted_role='db_reader'",
            (subject, rid),
        ).fetchone()
        return row["grant_state"] if row else "absent"

    @app.get("/healthz")
    def health():
        return {"status": "ok", "service": "mock-services"}

    @app.get("/readyz")
    def ready():
        try:
            with connect() as db:
                row = db.execute(
                    "SELECT EXISTS(SELECT 1 FROM corporate.resources) AS ready"
                ).fetchone()
            if row["ready"]:
                return {"status": "ok", "service": "mock-services"}
        except psycopg.Error:
            pass
        return JSONResponse({"status": "not_ready", "service": "mock-services"}, status_code=503)

    @app.get("/internal/v2/resources")
    async def resources(request: Request):
        await body(request)
        with connect() as db:
            rows = db.execute(
                "SELECT r.*,COALESCE((SELECT jsonb_agg(subject_id::text ORDER BY subject_id) "
                "FROM corporate.resource_approvers a WHERE a.resource_id=r.resource_id),'[]')"
                " AS approver_ids FROM corporate.resources r ORDER BY resource_id"
            ).fetchall()
        return result(
            request,
            "ResourcePolicyList",
            {
                "items": [
                    {
                        **{
                            k: r[k]
                            for k in (
                                "resource_id",
                                "team_id",
                                "title",
                                "requestable_roles",
                                "approver_ids",
                                "synthetic",
                            )
                        },
                        "allowed_verification_methods": [
                            "resource_policy_match",
                            "iam_permission_present",
                            "mock_db_connection",
                        ],
                    }
                    for r in rows
                ]
            },
        )

    @app.post("/internal/v2/access-requests")
    async def create(request: Request):
        data = await body(request, "AccessRequestCreate")
        key = data["operation_key"]
        if request.headers.get("Idempotency-Key") != key:
            raise Rejected(422, "VALIDATION_ERROR")
        with connect() as db:
            lock(db, key)
            old = db.execute(
                "SELECT * FROM corporate.access_requests WHERE operation_key=%s", (key,)
            ).fetchone()
            if old:
                if old["payload_hash"] != fingerprint(data):
                    raise Rejected(409, "IDEMPOTENCY_CONFLICT")
                return result(request, "AccessRequestRecord", record(old), 201)
            policy = resource(db, data["resource_id"])
            if data["requested_role"] not in policy["requestable_roles"]:
                raise Rejected(422, "ROLE_NOT_REQUESTABLE")
            row = db.execute(
                "INSERT INTO "
                "corporate.access_requests(mock_id,operation_key,payload_hash,initiator_id,resource,access_level,reason,status,requested_role,grant_state)"
                " VALUES (%s,%s,%s,%s,%s,'read',%s,'submitted',%s,'absent') RETURNING *",
                (
                    str(uuid4()),
                    key,
                    fingerprint(data),
                    data["subject_id"],
                    data["resource_id"],
                    data["reason"],
                    data["requested_role"],
                ),
            ).fetchone()
        return result(request, "AccessRequestRecord", record(row), 201)

    @app.get("/internal/v2/access-requests/by-operation/{key}")
    async def by_operation(key: str, request: Request):
        await body(request)
        try:
            UUID(key)
        except ValueError:
            raise Rejected(404, "NOT_FOUND") from None
        with connect() as db:
            row = db.execute(
                "SELECT * FROM corporate.access_requests WHERE operation_key=%s", (key,)
            ).fetchone()
        if not row:
            raise Rejected(404, "NOT_FOUND")
        return result(request, "AccessRequestRecord", record(row))

    @app.get("/internal/v2/access-requests/{mock_id}")
    async def get_request(mock_id: str, request: Request):
        await body(request)
        with connect() as db:
            row = db.execute(
                "SELECT * FROM corporate.access_requests WHERE mock_id=%s", (mock_id,)
            ).fetchone()
        if not row:
            raise Rejected(404, "NOT_FOUND")
        return result(request, "AccessRequestRecord", record(row))

    @app.post("/internal/v2/access-requests/{mock_id}/decision")
    async def decide(mock_id: str, request: Request):
        data = await body(request, "AccessDecision")
        with connect() as db:
            lock(db, data["operation_key"])
            row = db.execute(
                "SELECT * FROM corporate.access_requests WHERE mock_id=%s FOR UPDATE", (mock_id,)
            ).fetchone()
            if not row:
                raise Rejected(404, "NOT_FOUND")
            allowed = db.execute(
                "SELECT 1 FROM corporate.resource_approvers WHERE resource_id=%s AND subject_id=%s",
                (row["resource"], data["approver_id"]),
            ).fetchone()
            if not allowed or str(row["initiator_id"]) == data["approver_id"]:
                raise Rejected(403, "FORBIDDEN")
            previous = db.execute(
                "SELECT * FROM corporate.decisions WHERE operation_key=%s", (data["operation_key"],)
            ).fetchone()
            if previous:
                if previous["payload_hash"] != fingerprint({**data, "mock_id": mock_id}):
                    raise Rejected(409, "IDEMPOTENCY_CONFLICT")
                return result(request, "AccessRequestRecord", record(row))
            if row["status"] != "submitted":
                raise Rejected(409, "VERSION_CONFLICT")
            state = (
                "present"
                if data["decision"] == "approved" and grant_on_approval
                else "pending"
                if data["decision"] == "approved"
                else "absent"
            )
            if state == "present":
                db.execute(
                    "INSERT INTO corporate.iam_grants VALUES (%s,%s,'db_reader','present',now()) "
                    "ON CONFLICT (subject_id,resource_id,granted_role) DO UPDATE SET "
                    "grant_state='present',observed_at=now()",
                    (row["initiator_id"], row["resource"]),
                )
            row = db.execute(
                "UPDATE corporate.access_requests SET "
                "status=%s,grant_state=%s,updated_at=now() WHERE mock_id=%s RETURNING *",
                (data["decision"], state, mock_id),
            ).fetchone()
            db.execute(
                "INSERT INTO corporate.decisions VALUES (%s,%s,%s)",
                (data["operation_key"], mock_id, fingerprint({**data, "mock_id": mock_id})),
            )
        return result(request, "AccessRequestRecord", record(row))

    async def check(request, method):
        data = await body(
            request, "IamAccessCheckRequest" if method == "iam" else "DbConnectionCheckRequest"
        )
        with connect() as db:
            lock(db, data["check_id"])
            old = db.execute(
                "SELECT * FROM corporate.check_results WHERE check_id=%s", (data["check_id"],)
            ).fetchone()
            key = fingerprint({**data, "method": method})
            if old:
                if old["payload_hash"] != key:
                    raise Rejected(409, "IDEMPOTENCY_CONFLICT")
                value = old["result"]
            else:
                resource(db, data["resource_id"])
                state = grant(db, data["subject_id"], data["resource_id"])
                value = {
                    "event_id": str(uuid4()),
                    "check_id": data["check_id"],
                    "subject_id": data["subject_id"],
                    "resource_id": data["resource_id"],
                    "observed_at": timestamp(),
                    "synthetic": True,
                }
                if method == "iam":
                    value["grant_state"] = state
                else:
                    error = (
                        "ACCESS_DENIED"
                        if state != "present"
                        else "DB_SSL_REQUIRED"
                        if data["options"]["ssl_mode"] == "disable"
                        else None
                    )
                    value.update(
                        outcome="failed" if error else "passed", safe_options=data["options"]
                    )
                    if error:
                        value["error_code"] = error
                    db.execute(
                        "INSERT INTO corporate.connection_checks "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,true)",
                        (
                            data["check_id"],
                            data["subject_id"],
                            data["resource_id"],
                            data["options"]["ssl_mode"],
                            value["outcome"],
                            error,
                            value["observed_at"],
                        ),
                    )
                db.execute(
                    "INSERT INTO corporate.check_results VALUES (%s,%s,%s)",
                    (data["check_id"], key, Jsonb(value)),
                )
        return result(
            request, "IamAccessCheckResult" if method == "iam" else "DbConnectionCheckResult", value
        )

    @app.post("/internal/v2/iam/access-checks")
    async def iam(request: Request):
        return await check(request, "iam")

    @app.post("/internal/v2/db/connection-checks")
    async def connection_check(request: Request):
        return await check(request, "db")

    @app.get("/internal/v2/checks/by-operation/{key}")
    async def get_check(key: str, request: Request):
        await body(request)
        try:
            UUID(key)
        except ValueError:
            raise Rejected(404, "NOT_FOUND") from None
        with connect() as db:
            row = db.execute(
                "SELECT result FROM corporate.check_results WHERE check_id=%s", (key,)
            ).fetchone()
        if not row:
            raise Rejected(404, "NOT_FOUND")
        value = row["result"]
        return result(
            request,
            "IamAccessCheckResult" if "grant_state" in value else "DbConnectionCheckResult",
            value,
        )

    return app
