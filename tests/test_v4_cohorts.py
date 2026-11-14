"""Operator harness invariants: explicit dataset, monotone clock, independent metric oracle."""

import json
from datetime import UTC, datetime, timedelta

import pytest

from scripts.seed_v4_cohorts import cohort_id
from scripts.v4_cohorts import DATASET, setup, verify, write_clock


def test_clock_is_atomic_explicit_and_never_rewinds(tmp_path):
    at = datetime(2026, 11, 1, tzinfo=UTC)
    write_clock(tmp_path, at)
    value = json.loads((tmp_path / "clock.json").read_text())
    assert value == {"synthetic": True, "dataset": DATASET, "now": at.isoformat()}
    write_clock(tmp_path, at + timedelta(days=8))
    with pytest.raises(ValueError):
        write_clock(tmp_path, at)
    assert not (tmp_path / "clock.tmp").exists()
    (tmp_path / "clock.json").write_text('{"synthetic":false,"dataset":"user"}')
    with pytest.raises(ValueError):
        write_clock(tmp_path, at)


def test_only_dedicated_cohort_project_can_mount_clock(tmp_path):
    with pytest.raises(ValueError):
        setup("ai-buddy-demo-v4-final", tmp_path)
    command, env = setup("ai-buddy-demo-v4-cohorts", tmp_path)
    assert command[-1].endswith("compose.v4-cohorts.yaml")
    assert env["APP_ORIGIN"] == "http://localhost:15181"
    assert env["V4_COHORT_CLOCK_DIR"] == str(tmp_path.resolve())
    assert "--volumes" not in command
    assert len({cohort_id(n) for n in range(1, 21)}) == 20
    for invalid in (0, 21):
        with pytest.raises(ValueError):
            cohort_id(invalid)


def test_oracle_requires_real_api_counts_and_explicit_test_clock():
    result = {
        "clock_source": "synthetic_test_clock",
        "state": "ready",
        "before": {"eligible": 10, "affected": 6},
        "after": {"eligible": 10, "affected": 2},
        "delta_pp": -40,
    }
    verify(result)
    for change in (
        {"clock_source": "server_wall_clock"},
        {"state": "insufficient_data"},
        {"delta_pp": 40},
        {"before": {"eligible": 20, "affected": 6}},
    ):
        with pytest.raises(ValueError):
            verify({**result, **change})
