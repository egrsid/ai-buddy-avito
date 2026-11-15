"""Keep local rehearsal isolated from existing volumes and paid provider settings."""

from pathlib import Path

import pytest

from scripts.demo import (
    compose,
    configuration,
    main,
    port_is_free,
    port_owner,
    port_problems,
)


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
    with pytest.raises(SystemExit) as stopped:
        main()
    assert stopped.value.code == 7


def test_docker_failure_prints_hint_instead_of_traceback(monkeypatch, capsys):
    import subprocess

    def run(command, **kwargs):
        raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr("scripts.demo.subprocess.run", run)
    with pytest.raises(SystemExit):
        compose(["docker", "compose", "up"], {}, "поднять стенд")
    err = capsys.readouterr().err
    assert "Не удалось поднять стенд" in err and "--force-recreate" in err


def test_busy_port_of_another_stand_stops_up_before_compose(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["demo", "up", "--project", "ai-buddy-demo-tests"])
    monkeypatch.setattr("scripts.demo.port_is_free", lambda port: port != 15173)
    monkeypatch.setattr("scripts.demo.port_owner", lambda port: "ai-buddy-demo-review")
    monkeypatch.setattr("scripts.demo.subprocess.run", pytest.fail)
    with pytest.raises(SystemExit) as stopped:
        main()
    assert stopped.value.code == 2
    err = capsys.readouterr().err
    assert "Порт 15173 (сайт) занят стендом ai-buddy-demo-review" in err
    assert "DEMO_FRONTEND_PORT" in err and "Порт 18080" not in err


def test_ports_of_the_same_running_stand_are_not_a_conflict(monkeypatch):
    monkeypatch.setattr("scripts.demo.port_is_free", lambda port: False)
    monkeypatch.setattr("scripts.demo.port_owner", lambda port: "ai-buddy-demo-review")
    assert port_problems("ai-buddy-demo-review", {"сайт": 15173}, "hint") == []
    monkeypatch.setattr("scripts.demo.port_owner", lambda port: None)
    assert port_problems("ai-buddy-demo-review", {"сайт": 15173}, "hint") == [
        "Порт 15173 (сайт) занят другой программой.",
        "hint",
    ]


def test_port_probe_sees_a_listening_socket():
    import socket

    with socket.socket() as holder:
        holder.bind(("127.0.0.1", 0))
        holder.listen()
        port = holder.getsockname()[1]
        assert not port_is_free(port)


def test_port_owner_reads_compose_project_from_docker(monkeypatch):
    from types import SimpleNamespace

    listing = "ai-buddy-live-v4\t127.0.0.1:15180->5173/tcp\nother\t5432/tcp\n"
    monkeypatch.setattr(
        "scripts.demo.subprocess.run", lambda *a, **k: SimpleNamespace(stdout=listing)
    )
    assert port_owner(15180) == "ai-buddy-live-v4"
    assert port_owner(5432) is None


def test_up_prints_where_to_open(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["demo", "up", "--project", "ai-buddy-demo-test"])
    monkeypatch.setattr("scripts.demo.port_problems", lambda *a: [])
    calls = []
    monkeypatch.setattr("scripts.demo.subprocess.run", lambda cmd, **kw: calls.append(cmd))
    main()
    assert calls[0][-4:] == ["up", "--build", "-d", "--wait"]
    assert "Готово: откройте http://localhost:15173" in capsys.readouterr().out


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
