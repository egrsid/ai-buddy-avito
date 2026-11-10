"""Protect applied migrations and transaction boundaries without requiring a running database."""

from contextlib import contextmanager

import pytest

from scripts.migrate import apply, migration_plan


class Connection:
    def __init__(self, previous=None):
        self.previous = previous
        self.queries = []
        self.commits = 0
        self.rollbacks = 0

    @contextmanager
    def transaction(self):
        try:
            yield
        except Exception:
            self.rollbacks += 1
            raise
        else:
            self.commits += 1

    def execute(self, statement, parameters=None, **kwargs):
        self.queries.append((statement, parameters))
        return self

    def fetchone(self):
        return self.previous


def test_duplicate_migration_number_is_rejected(tmp_path):
    (tmp_path / "001_a.sql").write_text("SELECT 1")
    (tmp_path / "001_b.sql").write_text("SELECT 2")
    with pytest.raises(ValueError, match="Duplicate"):
        migration_plan(tmp_path)


def test_migrations_are_sorted_numerically(tmp_path):
    for number in (10, 2, 1):
        (tmp_path / f"{number}_test.sql").write_text("SELECT 1")
    assert [p.name for p in migration_plan(tmp_path)] == ["1_test.sql", "2_test.sql", "10_test.sql"]


def test_changed_applied_migration_is_not_executed(tmp_path):
    content = "DROP TABLE important_data"
    (tmp_path / "001_initial.sql").write_text(content)
    connection = Connection(previous=("old-checksum",))
    with pytest.raises(ValueError, match="Applied migration changed"):
        apply(connection, "app", "app_owner", tmp_path)
    assert connection.rollbacks == 1 and connection.commits == 0
    assert not any(query == content for query, _ in connection.queries)
