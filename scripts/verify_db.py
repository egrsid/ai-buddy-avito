"""Non-destructive integration checks in an isolated development/CI database."""

import psycopg
from psycopg import sql

from scripts.db import connect


def main() -> None:
    with connect() as connection:
        connection.autocommit = True
        assert connection.execute("SELECT count(*) FROM app.users").fetchone()[0] == 4
        assert connection.execute("SELECT count(*) FROM app.tasks").fetchone()[0] == 8
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
