"""Transactional, checksum-protected local migrations for three separately owned schemas."""

import hashlib
from pathlib import Path

from psycopg import sql

from scripts.db import connect

ROOT = Path(__file__).resolve().parents[1]
TARGETS = (
    ("app", "app_owner", "backend/migrations"),
    ("kb", "kb_owner", "ai-service/migrations"),
    ("corporate", "corporate_owner", "mock-services/migrations"),
)


def migration_plan(directory: Path) -> list[Path]:
    files = sorted(directory.glob("*.sql"))
    numbers = [int(path.name.split("_", 1)[0]) for path in files]
    if len(numbers) != len(set(numbers)):
        raise ValueError(f"Duplicate migration number: {directory}")
    return sorted(files, key=lambda p: int(p.name.split("_", 1)[0]))


def apply(connection, schema: str, owner: str, directory: Path) -> None:
    for path in migration_plan(directory):
        content = path.read_text()
        checksum = hashlib.sha256(content.encode()).hexdigest()
        with connection.transaction():
            connection.execute("SELECT pg_advisory_xact_lock(740011)")
            connection.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(owner)))
            connection.execute(
                sql.SQL("SET LOCAL search_path TO {}, public").format(sql.Identifier(schema))
            )
            connection.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations "
                "(name text PRIMARY KEY, checksum text NOT NULL, "
                "applied_at timestamptz NOT NULL DEFAULT now())"
            )
            runtime = {"app": "app_service", "kb": "ai_service", "corporate": "mock_service"}[
                schema
            ]
            connection.execute(
                sql.SQL("REVOKE ALL ON schema_migrations FROM {}").format(sql.Identifier(runtime))
            )
            previous = connection.execute(
                "SELECT checksum FROM schema_migrations WHERE name=%s", (path.name,)
            ).fetchone()
            if previous:
                if previous[0] != checksum:
                    raise ValueError(f"Applied migration changed: {schema}/{path.name}")
                continue
            connection.execute(content, prepare=False)
            connection.execute(
                "INSERT INTO schema_migrations(name,checksum) VALUES (%s,%s)",
                (path.name, checksum),
            )
            print(f"Applied {schema}/{path.name}")


def main() -> None:
    with connect() as connection:
        # autocommit keeps each transaction independent; no partial migration commits.
        connection.autocommit = True
        for schema, owner, folder in TARGETS:
            apply(connection, schema, owner, ROOT / folder)


if __name__ == "__main__":
    main()
