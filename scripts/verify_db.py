"""Non-destructive integration checks in an isolated development/CI database."""

import json
from pathlib import Path

import psycopg
from psycopg import sql

from scripts.db import connect


def main() -> None:
    with connect() as connection:
        connection.autocommit = True
        data = json.loads(
            (Path(__file__).resolve().parents[1] / "data/seed/demo.json").read_text(
                encoding="utf-8"
            )
        )
        # Check seed identities, allowing additional runtime records without a destructive reset.
        for schema, table, key in (
            ("app", "users", "users"),
            ("app", "tasks", "tasks"),
            ("kb", "documents", "documents"),
        ):
            ids = [item["id"] for item in data[key]]
            assert len(ids) == len(set(ids)), f"Duplicate {key} seed IDs"
            count = connection.execute(
                sql.SQL("SELECT count(*) FROM {}.{} WHERE id = ANY(%s::uuid[])").format(
                    sql.Identifier(schema), sql.Identifier(table)
                ),
                (ids,),
            ).fetchone()[0]
            assert count == len(ids), f"Missing {schema}.{table} seed IDs"
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
