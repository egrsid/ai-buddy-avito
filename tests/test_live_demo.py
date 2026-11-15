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
    "EMBEDDING_PRICE_RUB": "0.61",
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


def test_custom_ports_and_cached_build_keep_live_overlay_last(tmp_path):
    path = write_env(tmp_path, {**GOOD, "FRONTEND_PORT": "15180", "BACKEND_PORT": "18087"})
    command, env = configuration("ai-buddy-live-v4", path, True)
    assert env["APP_ORIGIN"] == "http://localhost:15180"
    assert env["BACKEND_PORT"] == "18087"
    assert command[-1].endswith("compose.live.yaml")
    assert command[-3].endswith("compose.offline.yaml")
    for ports in ({"FRONTEND_PORT": "80"}, {"FRONTEND_PORT": "18080"}):
        with pytest.raises(ValueError):
            configuration("ai-buddy-live-v4", write_env(tmp_path, {**GOOD, **ports}))


@pytest.mark.parametrize("price", ["-1", "nan", "inf", "wrong"])
def test_bad_tariffs_are_rejected_before_paid_calls(price):
    assert config_problems({**GOOD, "LLM_PRICE_INPUT_RUB": price})
    assert config_problems({**GOOD, "LLM_BUDGET_STOP_RUB": price})
    assert config_problems({**GOOD, "LLM_BUDGET_STOP_RUB": "801"})


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


def test_cached_build_falls_back_to_network_build_without_cached_images(tmp_path, monkeypatch):
    path = write_env(tmp_path, GOOD)
    calls = []
    monkeypatch.setattr("scripts.live_demo.offline_images_present", lambda: False)
    monkeypatch.setattr("scripts.live_demo.subprocess.run", lambda c, **k: calls.append(c))
    assert (
        main(["status", "--env-file", str(path), "--project", "ai-buddy-live-v4", "--cached-build"])
        == 0
    )
    assert not any(part.endswith("compose.offline.yaml") for part in calls[0])
    monkeypatch.setattr("scripts.live_demo.offline_images_present", lambda: True)
    calls.clear()
    main(["status", "--env-file", str(path), "--project", "ai-buddy-live-v4", "--cached-build"])
    assert any(part.endswith("compose.offline.yaml") for part in calls[0])


def test_failed_evals_still_exports_the_current_report(tmp_path, monkeypatch):
    from types import SimpleNamespace

    calls = []
    monkeypatch.setattr("scripts.live_demo.ROOT", tmp_path)

    def execute(command, **kwargs):
        calls.append((command, kwargs))
        return SimpleNamespace(returncode=1)

    monkeypatch.setattr("scripts.live_demo.subprocess.run", execute)
    path = write_env(tmp_path, GOOD)
    assert main(["evals", "--env-file", str(path)]) == 1
    assert calls[0][1]["check"] is False
    assert calls[1][0][:2] == ["docker", "cp"]
    assert "/tmp/v4-revision-live.md" in calls[1][0][2]
