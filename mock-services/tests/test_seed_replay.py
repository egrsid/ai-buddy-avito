"""Replay must preserve revocations, and conflicting legacy assignments require a fresh DB."""

import os

import psycopg
import pytest

from scripts.seed_v2 import seed


def test_seed_preserves_revocations_and_rejects_legacy_conflict():
    dsn = os.environ["MOCK_TEST_ADMIN_DSN"]
    assert "test" in psycopg.conninfo.conninfo_to_dict(dsn)["dbname"]
    with psycopg.connect(dsn) as db:
        before = db.execute("SELECT id,status,version FROM app.goals ORDER BY id").fetchall()
        with db.transaction(force_rollback=True):
            db.execute(
                "DELETE FROM app.document_permissions WHERE subject_id=%s",
                ("10000000-0000-4000-8000-000000000003",),
            )
            db.execute(
                "DELETE FROM app.role_assignments WHERE user_id=%s",
                ("10000000-0000-4000-8000-000000000003",),
            )
            db.execute("DELETE FROM app.resource_approvers")
            db.execute("DELETE FROM corporate.resource_approvers")
            seed(db)
            assert (
                db.execute(
                    "SELECT count(*) FROM app.document_permissions WHERE subject_id=%s",
                    ("10000000-0000-4000-8000-000000000003",),
                ).fetchone()[0]
                == 0
            )
            assert (
                db.execute(
                    "SELECT count(*) FROM app.role_assignments WHERE user_id=%s",
                    ("10000000-0000-4000-8000-000000000003",),
                ).fetchone()[0]
                == 0
            )
            assert db.execute("SELECT count(*) FROM app.resource_approvers").fetchone()[0] == 0
            assert (
                db.execute("SELECT count(*) FROM corporate.resource_approvers").fetchone()[0] == 0
            )
            assert (
                before
                == db.execute("SELECT id,status,version FROM app.goals ORDER BY id").fetchall()
            )
        with db.transaction(force_rollback=True):
            db.execute("UPDATE app.users SET team='team-b' WHERE account_id='intern-b'")
            with pytest.raises(ValueError, match="fresh demo DB"):
                seed(db)
