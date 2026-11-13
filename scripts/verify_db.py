"""Non-destructive integration checks in an isolated development/CI database."""

import json
import os
from pathlib import Path

import psycopg
from psycopg import sql

from scripts.db import connect


def main() -> None:
    with connect() as connection:
        connection.autocommit = True
        v2 = os.environ.get("SEED_DATASET", "legacy") == "v2"
        data = json.loads(
            (
                Path(__file__).resolve().parents[1]
                / "data/seed"
                / ("demo-v2.json" if v2 else "demo.json")
            ).read_text(encoding="utf-8")
        )
        # Check seed identities, allowing additional runtime records without a destructive reset.
        for schema, table, key in (
            ("app", "users", "users"),
            ("app", "tasks", "tasks"),
            ("kb", "documents", "documents"),
        ):
            if v2 and table == "tasks":
                continue
            ids = [item["id"] for item in data[key]]
            assert len(ids) == len(set(ids)), f"Duplicate {key} seed IDs"
            count = connection.execute(
                sql.SQL("SELECT count(*) FROM {}.{} WHERE id = ANY(%s::uuid[])").format(
                    sql.Identifier(schema), sql.Identifier(table)
                ),
                (ids,),
            ).fetchone()[0]
            assert count == len(ids), f"Missing {schema}.{table} seed IDs"
        if v2:
            for user in data["users"]:
                row = connection.execute(
                    "SELECT team,buddy_id FROM app.users WHERE id=%s", (user["id"],)
                ).fetchone()
                assert row[0] == user["team"]
                assert str(row[1] or "") == (user["buddy_id"] or "")
            assert (
                connection.execute(
                    "SELECT count(*) FROM app.journey_templates WHERE journey_id=%s AND version=1",
                    ("db-access-team-a",),
                ).fetchone()[0]
                == 1
            )
            assert connection.execute("SELECT count(*) FROM kb.chunks").fetchone()[0] > 0
            assert connection.execute("SELECT count(*) FROM kb.index_metadata").fetchone()[0] == 1
        for role, own in (
            ("app_service", "app"),
            ("ai_service", "kb"),
            ("mock_service", "corporate"),
        ):
            with connection.transaction():
                connection.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role)))
                table = (
                    "users" if own == "app" else ("documents" if own == "kb" else "access_requests")
                )
                connection.execute(
                    sql.SQL("SELECT count(*) FROM {}.{}").format(
                        sql.Identifier(own), sql.Identifier(table)
                    )
                )
            forbidden = [
                f"CREATE TABLE {own}.forbidden_probe(id integer)",
                f"DELETE FROM {own}.schema_migrations",
            ]
            for foreign in {"app", "kb", "corporate"} - {own}:
                forbidden.extend(
                    [
                        f"SELECT * FROM {foreign}.schema_migrations",
                        f"DELETE FROM {foreign}.schema_migrations",
                    ]
                )
            for query in forbidden:
                try:
                    with connection.transaction(force_rollback=True):
                        connection.execute(
                            sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role))
                        )
                        connection.execute(query)
                except psycopg.errors.InsufficientPrivilege:
                    continue
                raise AssertionError(f"Unexpected permission for {role}: {query}")
    print("Seed counts and runtime schema isolation: OK")


if __name__ == "__main__":
    main()
