"""Prepare a dedicated disposable Backend test DB; never target the application DB."""

import os

import psycopg
from psycopg import sql

from scripts.migrate import ROOT, apply
from scripts.seed_v2 import seed


def main():
    dsn = os.environ["TEST_DATABASE_URL"]
    info = psycopg.conninfo.conninfo_to_dict(dsn)
    if not info["dbname"].startswith("buddy_test_"):
        raise ValueError("Use a separate database named buddy_test_*")
    with psycopg.connect(dsn, autocommit=True) as db:
        for schema, owner, runtime, variable in [
            ("app", "app_owner", "app_service", "TEST_APP_PASSWORD"),
            ("corporate", "corporate_owner", "mock_service", "TEST_MOCK_PASSWORD"),
        ]:
            for role in (owner, runtime):
                if not db.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (role,)).fetchone():
                    if role == owner:
                        db.execute(sql.SQL("CREATE ROLE {} NOLOGIN").format(sql.Identifier(role)))
                    else:
                        db.execute(
                            sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(
                                sql.Identifier(role), sql.Literal(os.environ[variable])
                            )
                        )
            db.execute(
                sql.SQL("CREATE SCHEMA IF NOT EXISTS {} AUTHORIZATION {}").format(
                    sql.Identifier(schema), sql.Identifier(owner)
                )
            )
            db.execute(
                sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(
                    sql.Identifier(schema), sql.Identifier(runtime)
                )
            )
            db.execute(
                sql.SQL(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA {} "
                    "GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO {}"
                ).format(sql.Identifier(owner), sql.Identifier(schema), sql.Identifier(runtime))
            )
        apply(db, "app", "app_owner", ROOT / "backend/migrations")
        apply(db, "corporate", "corporate_owner", ROOT / "mock-services/migrations")
        with db.transaction():
            seed(db)


if __name__ == "__main__":
    main()
