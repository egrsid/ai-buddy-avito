"""Check the exported documentation, rather than relying on ignored local notes."""

import hashlib
import json
import shutil

import pytest

from scripts import check_repo
from scripts.verify_coverage import ROOT, verify


def test_link_to_existing_private_note_is_rejected(tmp_path, monkeypatch):
    readme = tmp_path / "README.md"
    readme.write_text("[internal](private.md)", encoding="utf-8")
    architecture = tmp_path / "ARCHITECTURE.md"
    architecture.write_text("Architecture", encoding="utf-8")
    (tmp_path / "private.md").write_text("Local only", encoding="utf-8")
    monkeypatch.setattr(check_repo, "published_files", lambda _: {readme, architecture})
    assert check_repo.check_links(tmp_path) == ["Broken link README.md: private.md"]


def test_published_directory_link_accepts_a_tracked_child(tmp_path, monkeypatch):
    readme = tmp_path / "README.md"
    readme.write_text("[sources](src)", encoding="utf-8")
    architecture = tmp_path / "ARCHITECTURE.md"
    architecture.write_text("Architecture", encoding="utf-8")
    (tmp_path / "src").mkdir()
    child = tmp_path / "src/source.py"
    child.write_text("", encoding="utf-8")
    monkeypatch.setattr(check_repo, "published_files", lambda _: {readme, architecture, child})
    assert check_repo.check_links(tmp_path) == []


def test_saved_coverage_matches_application_and_all_component_thresholds():
    result = verify()
    assert set(result) == {"backend", "ai", "mock", "frontend"}
    assert all(value["percent"] >= 82 for value in result.values())


@pytest.mark.parametrize("corruption", ["source", "threshold", "summary"])
def test_coverage_evidence_rejects_tampering(tmp_path, corruption):
    directory = tmp_path / "docs/coverage"
    shutil.copytree(ROOT / "docs/coverage", directory)
    source = tmp_path / "source.py"
    source.write_text("", encoding="utf-8")
    manifest = {"files": {"source.py": hashlib.sha256(b"").hexdigest()}}
    (directory / "source-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    if corruption == "source":
        source.write_text("changed", encoding="utf-8")
    elif corruption == "threshold":
        (directory / "backend.coverprofile").write_text(
            "mode: atomic\nsource.go:1.1,2.1 1 0\n", encoding="utf-8"
        )
    else:
        summary = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
        summary["backend"]["covered"] += 1
        (directory / "summary.json").write_text(json.dumps(summary), encoding="utf-8")
    with pytest.raises(ValueError):
        verify(tmp_path)
