import pytest
from app.config import ConfigError, load_settings


def test_defaults_are_safe():
    settings = load_settings({"INTERNAL_API_TOKEN": "t"})
    assert settings.app_env == "production"
    assert settings.llm_mode == "mock"
    assert settings.mock_faults_enabled is False
    assert settings.first_token_timeout == 20.0
    assert settings.stream_idle_timeout == 25.0
    assert settings.pipeline_timeout == 85.0
    assert settings.ping_interval == 10.0


def test_faults_allowed_in_local_mock():
    env = {"INTERNAL_API_TOKEN": "t", "APP_ENV": "local", "MOCK_FAULTS_ENABLED": "true"}
    assert load_settings(env).mock_faults_enabled is True


@pytest.mark.parametrize(
    "env",
    [
        {},
        {"INTERNAL_API_TOKEN": ""},
        {"INTERNAL_API_TOKEN": "t", "APP_ENV": "staging"},
        {"INTERNAL_API_TOKEN": "t", "LLM_MODE": "live"},
        {"INTERNAL_API_TOKEN": "t", "LLM_MODE": "other"},
        {"INTERNAL_API_TOKEN": "t", "MOCK_FAULTS_ENABLED": "yes"},
        # Сбои в production — ошибка старта, даже если сценарий normal.
        {"INTERNAL_API_TOKEN": "t", "MOCK_FAULTS_ENABLED": "true"},
    ],
)
def test_bad_configuration_stops_startup(env):
    with pytest.raises(ConfigError):
        load_settings(env)
