"""Catch mixed contract snapshots, legacy false readiness and non-UTF-8 seed reads."""

import hashlib
import json

import pytest
import yaml

from scripts import seed
from scripts.contract_baseline import snapshot, verify
from scripts.mvp_preflight import blockers


def test_contract_lock_detects_modified_and_added_files(tmp_path):
    schema = tmp_path / "schema.json"
    schema.write_bytes(b"{}")
    manifest = tmp_path / "BASELINE.sha256"
    manifest.write_text(snapshot(tmp_path), encoding="utf-8")
    verify(tmp_path)
    schema.write_bytes(b'{"changed":true}')
    with pytest.raises(ValueError, match="Contract snapshot changed"):
        verify(tmp_path)
    manifest.write_text(snapshot(tmp_path), encoding="utf-8")
    (tmp_path / "extra.json").write_bytes(b"{}")
    with pytest.raises(ValueError):
        verify(tmp_path)


def test_contract_lock_ignores_windows_line_endings_only(tmp_path):
    schema = tmp_path / "schema.json"
    schema.write_bytes(b'{\n  "a": 1\n}\n')
    manifest = tmp_path / "BASELINE.sha256"
    manifest.write_text(snapshot(tmp_path), encoding="utf-8")
    schema.write_bytes(b'{\r\n  "a": 1\r\n}\r\n')
    verify(tmp_path)
    schema.write_bytes(b'{\r\n  "a": 2\r\n}\r\n')
    with pytest.raises(ValueError):
        verify(tmp_path)


def test_legacy_checkout_cannot_pass_mvp_preflight(tmp_path):
    issues = blockers(tmp_path, {})
    assert any("v2 migration" in item for item in issues)
    assert any("business implementation" in item for item in issues)
    assert any("AI_INGEST_COMMAND" in item for item in issues)
    assert any("AI_DB_TEST_COMMAND" in item for item in issues)


def test_ai_runners_have_no_admin_credentials_and_wait_for_seed():
    from scripts.check_repo import ROOT

    services = yaml.safe_load((ROOT / "compose.mvp.yaml").read_text(encoding="utf-8"))["services"]
    for name in ("ai-ingest", "ai-db-tests"):
        environment = services[name]["environment"]
        assert environment["PGUSER"] == "ai_service"
        assert "POSTGRES_USER" not in environment
        assert "POSTGRES_PASSWORD" not in environment
    assert (
        services["ai-ingest"]["depends_on"]["seed"]["condition"] == "service_completed_successfully"
    )
    assert "ai-ingest" in services["ai-service"]["depends_on"]
    assert services["ai-db-tests"]["environment"]["LLM_API_KEY"] == ""


def test_seed_content_and_hash_do_not_depend_on_locale(tmp_path, monkeypatch):
    (tmp_path / "data/seed").mkdir(parents=True)
    content = "Синтетический документ: подключение к БД, ёж 🦔\n"
    (tmp_path / "doc.md").write_bytes(content.encode("utf-8"))
    data = {
        "users": [],
        "tasks": [],
        "documents": [
            {
                "id": "fixture",
                "title": "Инструкция",
                "path": "doc.md",
                "version": 1,
                "visibility": "demo_public",
                "synthetic": True,
            }
        ],
    }
    (tmp_path / "data/seed/demo.json").write_bytes(
        json.dumps(data, ensure_ascii=False).encode("utf-8")
    )

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def execute(self, query, parameters=None):
            if query.startswith("INSERT INTO kb.documents"):
                assert parameters[2] == content
                assert parameters[4] == hashlib.sha256(content.encode("utf-8")).hexdigest()
                self.inserted = True

    connection = Connection()
    monkeypatch.setattr(seed, "ROOT", tmp_path)
    monkeypatch.setattr(seed, "connect", lambda: connection)
    read = type(tmp_path).read_text

    def strict_read(self, encoding=None, **kwargs):
        assert encoding == "utf-8"
        return read(self, encoding=encoding, **kwargs)

    monkeypatch.setattr(type(tmp_path), "read_text", strict_read)
    seed.main()
    assert connection.inserted
