"""Keep local rehearsal isolated from existing volumes and paid provider settings."""

from pathlib import Path

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
    assert Path(command[command.index("--env-file") + 1]).name == ".env.example"


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


def test_restart_drains_backend_and_waits_for_dependencies(monkeypatch):
    monkeypatch.setattr("sys.argv", ["demo", "restart", "--project", "ai-buddy-demo-test"])
    calls = []
    monkeypatch.setattr("scripts.demo.subprocess.run", lambda cmd, **kw: calls.append(cmd))
    main()
    assert calls[0][-2:] == ["stop", "backend"]
    assert calls[1][-3:] == ["restart", "ai-service", "mock-services"]
    assert "--wait" in calls[2] and calls[2][-2:] == ["ai-service", "mock-services"]
    assert "--wait" in calls[3] and calls[3][-1] == "backend"


def test_demo_separate_ports_match_origin(monkeypatch):
    monkeypatch.setenv("DEMO_FRONTEND_PORT", "15175")
    monkeypatch.setenv("DEMO_BACKEND_PORT", "18082")
    _, env = configuration("ai-buddy-demo-qa")
    assert env["APP_ORIGIN"] == "http://localhost:15175"
    assert env["FRONTEND_PORT"] == "15175"
    assert env["BACKEND_PORT"] == "18082"
    monkeypatch.setenv("DEMO_FRONTEND_PORT", "80")
    with pytest.raises(ValueError):
        configuration("ai-buddy-demo-qa")
