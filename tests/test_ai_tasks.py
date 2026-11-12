"""Protect the test harness boundary and preserve task failures."""

import subprocess

import pytest

from scripts.ai_tasks import command_for, main, validate_environment


@pytest.mark.parametrize("raw", ["", "python -m app.ingest", "{}", "[]", "[1]", '[""]'])
def test_missing_or_shell_commands_fail_closed(raw):
    with pytest.raises(ValueError):
        command_for("ingest", {"AI_INGEST_COMMAND": raw})


def test_argv_is_preserved_without_shell_expansion():
    assert command_for("ingest", {"AI_INGEST_COMMAND": '["python", "$SECRET; echo x"]'}) == [
        "python",
        "$SECRET; echo x",
    ]


@pytest.mark.parametrize(
    "changes",
    [
        {"PGUSER": "buddy_admin"},
        {"POSTGRES_PASSWORD": "secret"},
        {"APP_ENV": "production", "MOCK_FAULTS_ENABLED": "true"},
        {"LLM_MODE": "live", "MOCK_FAULTS_ENABLED": "true"},
        {"AI_MOCK_SCENARIO": "invalid_tool"},
        {"AI_MOCK_SCENARIO": "arbitrary"},
        {"MOCK_FAULTS_ENABLED": "yes"},
        {"LLM_MODE": "typo"},
    ],
)
def test_unsafe_task_configuration_is_rejected(changes):
    with pytest.raises(ValueError):
        validate_environment({"PGUSER": "ai_service", "APP_ENV": "test", **changes})


def test_task_failure_is_not_reported_as_success(monkeypatch):
    monkeypatch.setenv("PGUSER", "ai_service")
    monkeypatch.setenv("AI_INGEST_COMMAND", '["python", "-m", "app.ingest"]')
    monkeypatch.setattr("sys.argv", ["ai_tasks", "ingest"])

    def failed(command, **kwargs):
        assert kwargs == {"check": True, "timeout": 300}
        raise subprocess.CalledProcessError(7, command)

    monkeypatch.setattr("scripts.ai_tasks.subprocess.run", failed)
    with pytest.raises(subprocess.CalledProcessError):
        main()
