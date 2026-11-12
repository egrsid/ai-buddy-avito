"""The v2 seed layout keeps AI document IDs and does not rewrite seed v1."""

import json
from pathlib import Path

from pglast import parse_sql

ROOT = Path(__file__).resolve().parents[1]
DOCUMENTS = {
    "connection-a": "0000000a-0000-4000-8000-00000000000a",
    "request-a": "0000000b-0000-4000-8000-00000000000b",
    "public": "0000000c-0000-4000-8000-00000000000c",
    "team-b": "0000000d-0000-4000-8000-00000000000d",
    "restricted": "0000000e-0000-4000-8000-00000000000e",
    "private": "0000000f-0000-4000-8000-00000000000f",
    "injection": "00000010-0000-4000-8000-000000000010",
}


def test_v2_layout_uses_the_ai_document_ids():
    layout = json.loads((ROOT / "data/seed/v2-layout.json").read_text(encoding="utf-8"))
    demo = json.loads((ROOT / "data/seed/demo.json").read_text(encoding="utf-8"))
    documents = {item["key"]: item for item in layout["documents"]}
    assert {item["id"] for item in documents.values()} == set(DOCUMENTS.values())
    assert all(item["version"] == 1 for item in documents.values())
    intern_b = next(item for item in layout["accounts"] if item["account_id"] == "intern-b")
    assert intern_b["reassignment"] == "not-applied"
    assert intern_b["team_id"] == "team-b"
    v1_intern_b = next(item for item in demo["users"] if item["account_id"] == "intern-b")
    assert v1_intern_b["id"] == intern_b["id"]


def test_v2_migrations_parse_and_add_tables():
    app_sql = (ROOT / "backend/migrations/002_v2_app.sql").read_text(encoding="utf-8")
    corporate_path = ROOT / "mock-services/migrations/002_v2_corporate.sql"
    corporate_sql = corporate_path.read_text(encoding="utf-8")
    parse_sql(app_sql)
    parse_sql(corporate_sql)
    for name in ("goals", "step_progress", "verification_checks", "evidence", "friction_events"):
        assert f"CREATE TABLE {name}" in app_sql
    for name in ("resources", "iam_grants", "connection_checks"):
        assert f"CREATE TABLE {name}" in corporate_sql
    assert "dsn" not in corporate_sql.lower()
    assert "select " not in corporate_sql.lower()
