import json

import pytest

from scripts import v4_readiness
from scripts.coverage_policy import meets_line_threshold


@pytest.mark.parametrize(
    "covered,total,passed",
    [
        (82, 100, True),
        (8199, 10000, False),
        (0, 0, False),
        (83, 100, True),
        (-1, 2, False),
        (3, 2, False),
    ],
)
def test_exact_component_coverage(covered, total, passed):
    assert meets_line_threshold(covered, total) is passed


def test_missing_contracts_never_claim_acceptance(tmp_path):
    result = v4_readiness.inventory(tmp_path)
    assert result["artifact_status"] == "blocked"
    assert result["missing"] == list(v4_readiness.REQUIRED)
    assert result["live_acceptance"] == result["runtime_acceptance"] == "open"


def test_schema_artifacts_are_not_consumer_or_runtime_approval(tmp_path):
    for name in v4_readiness.REQUIRED:
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"$id": "https://example.invalid/" + path.name, "type": "object"})
        )
    result = v4_readiness.inventory(tmp_path)
    assert result["artifact_status"] == "present_not_accepted"
    assert result["consumer_approval"] == "open"
    first = result["schema_sha256"].copy()
    (tmp_path / v4_readiness.REQUIRED[0]).write_text('{"$id":"https://example.invalid/changed"}')
    assert v4_readiness.inventory(tmp_path)["schema_sha256"] != first


@pytest.mark.parametrize("raw", ["{", "[]", '{"type":"invalid"}', '{"$id":"id","type":"invalid"}'])
def test_invalid_contract_is_blocking(tmp_path, raw):
    path = tmp_path / v4_readiness.REQUIRED[0]
    path.parent.mkdir(parents=True)
    path.write_text(raw)
    assert v4_readiness.inventory(tmp_path)["invalid"] == [v4_readiness.REQUIRED[0]]


def test_manifest_records_actual_revision_without_environment(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(v4_readiness, "ROOT", tmp_path)
    monkeypatch.setenv("LLM_API_KEY", "should-never-appear")
    monkeypatch.setattr(
        v4_readiness.subprocess,
        "check_output",
        lambda cmd, **kw: "abc123\n" if "rev-parse" in cmd else "modified",
    )
    output = tmp_path / "manifest.json"
    assert v4_readiness.main(["--output", str(output)]) == 2
    result = json.loads(output.read_text())
    assert result["code_revision"] == "abc123"
    assert result["tree_dirty"] is True and result["provider_calls_executed"] is False
    assert "should-never-appear" not in capsys.readouterr().out
    assert result["dataset_revision"] is None


def test_inventory_only_cli_does_not_claim_full_gate(monkeypatch, capsys):
    monkeypatch.setattr(
        v4_readiness,
        "manifest",
        lambda root: {"outcomes": {"artifact_status": "present_not_accepted"}},
    )
    assert v4_readiness.main([]) == 0
    assert "present_not_accepted" in capsys.readouterr().out
