"""Live-демо: неверный .env останавливает запуск до Docker, оболочка не перебивает .env."""

import pytest

from scripts.live_demo import config_problems, configuration, main, read_env_file

GOOD = {
    "LLM_MODE": "live",
    "LLM_PROVIDER": "openai",
    "LLM_BASE_URL": "https://example.invalid/v1",
    "LLM_MODEL": "primary-model",
    "LLM_API_KEY": "secret-key-value",
    "LLM_PRICE_INPUT_RUB": "1",
    "LLM_PRICE_OUTPUT_RUB": "2",
    "EMBEDDING_MODEL": "embed-model",
}


def write_env(tmp_path, values):
    path = tmp_path / ".env"
    lines = ["# комментарий", ""] + [f"{key}={value}" for key, value in values.items()]
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def test_good_live_config_has_no_problems(tmp_path):
    assert read_env_file(write_env(tmp_path, GOOD)) == GOOD
    assert config_problems(GOOD) == []


@pytest.mark.parametrize(
    "change, problem",
    [
        ({"LLM_MODE": "mock"}, "LLM_MODE"),
        ({"LLM_PROVIDER": "ollama"}, "LLM_PROVIDER"),
        ({"LLM_API_KEY": ""}, "LLM_API_KEY"),
        ({"LLM_PRICE_OUTPUT_RUB": ""}, "LLM_PRICE_OUTPUT_RUB"),
        ({"LLM_FALLBACK_MODEL": "reserve"}, "LLM_FALLBACK_PRICE_INPUT_RUB"),
    ],
)
def test_bad_live_config_is_reported_by_name(change, problem):
    problems = config_problems({**GOOD, **change})
    assert any(problem in item for item in problems)


def test_bad_config_stops_before_docker_and_hides_values(tmp_path, monkeypatch, capsys):
    path = write_env(tmp_path, {**GOOD, "LLM_MODE": "mock"})
    monkeypatch.setattr("scripts.live_demo.subprocess.run", pytest.fail)
    assert main(["up", "--env-file", str(path)]) == 2
    output = capsys.readouterr().out
    assert "LLM_MODE" in output and "secret-key-value" not in output


def test_missing_env_file(tmp_path):
    assert main(["check", "--env-file", str(tmp_path / "нет.env")]) == 2


def test_check_passes_without_docker(tmp_path, monkeypatch):
    monkeypatch.setattr("scripts.live_demo.subprocess.run", pytest.fail)
    assert main(["check", "--env-file", str(write_env(tmp_path, GOOD))]) == 0


def test_shell_llm_settings_do_not_override_env_file(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_MODE", "mock")
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("MOCK_FAULTS_ENABLED", "true")
    command, env = configuration("ai-buddy-live-test", tmp_path / ".env")
    assert "LLM_MODE" not in env and "LLM_API_KEY" not in env
    assert env["MOCK_FAULTS_ENABLED"] == "false"
    assert command[command.index("--env-file") + 1].endswith(".env")
    assert command[-1].endswith("compose.live.yaml")


def test_live_project_name_is_isolated(tmp_path):
    for name in ("ai-buddy", "ai-buddy-demo-local", "../live", "live;echo"):
        with pytest.raises(ValueError):
            configuration(name, tmp_path / ".env")


def test_up_and_down_call_compose(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "scripts.live_demo.subprocess.run", lambda command, **kwargs: calls.append(command)
    )
    path = write_env(tmp_path, GOOD)
    assert main(["up", "--env-file", str(path)]) == 0
    assert main(["down", "--env-file", str(path)]) == 0
    assert main(["status", "--env-file", str(path)]) == 0
    assert calls[0][-4:] == ["up", "--build", "-d", "--wait"]
    assert calls[1][-1] == "down" and "--volumes" not in calls[1]
    assert calls[2][-2:] == ["ps", "-a"]
