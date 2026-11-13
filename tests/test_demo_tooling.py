"""Keep local rehearsal isolated from existing volumes and paid provider settings."""

import pytest

from scripts.demo import configuration, main


def test_demo_cannot_target_existing_non_demo_project():
    for name in ("ai-buddy", "ai-buddy-tl-20261111", "../demo", "demo;echo"):
        with pytest.raises(ValueError):
            configuration(name)


def test_demo_ignores_inherited_live_mode_and_faults(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "live")
    monkeypatch.setenv("MOCK_FAULTS_ENABLED", "true")
    command, env = configuration("ai-buddy-demo-test")
    assert env["LLM_MODE"] == "mock" and env["MOCK_FAULTS_ENABLED"] == "false"
    assert env["APP_ORIGIN"] == "http://localhost:15173"
    assert command[command.index("--env-file") + 1].endswith("/.env.example")


def test_demo_down_preserves_volume_and_propagates_failure(monkeypatch):
    import subprocess

    monkeypatch.setattr("sys.argv", ["demo", "down", "--project", "ai-buddy-demo-test"])

    def run(command, **kwargs):
        assert command[-1] == "down" and "--volumes" not in command
        assert kwargs["check"]
        raise subprocess.CalledProcessError(7, command)

    monkeypatch.setattr("scripts.demo.subprocess.run", run)
    with pytest.raises(subprocess.CalledProcessError):
        main()
