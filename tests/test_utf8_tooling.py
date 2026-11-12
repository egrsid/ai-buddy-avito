"""Ensure Cyrillic seed content/checksums survive a non-UTF-8 process locale."""

import hashlib

from scripts.migrate import apply
from tests.test_migrations import Connection


def test_migration_uses_utf8_bytes_without_rewriting_checksum(tmp_path, monkeypatch):
    content = "SELECT 'Синтетический пример — ёж';\n"
    path = tmp_path / "002_cyrillic.sql"
    path.write_bytes(content.encode("utf-8"))
    original = type(path).read_text

    def locale_independent_read(self, encoding=None, **kwargs):
        assert encoding == "utf-8"
        return original(self, encoding=encoding, **kwargs)

    monkeypatch.setattr(type(path), "read_text", locale_independent_read)
    connection = Connection()
    apply(connection, "app", "app_owner", tmp_path)
    assert any(query == content for query, _ in connection.queries)
    assert any(
        parameters == (path.name, hashlib.sha256(content.encode("utf-8")).hexdigest())
        for _, parameters in connection.queries
    )
