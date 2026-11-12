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


LIVE = {
    "INTERNAL_API_TOKEN": "t",
    "LLM_MODE": "live",
    "LLM_BASE_URL": "http://host.docker.internal:11434/",
    "LLM_MODEL": "qwen3.5:9b",
}


def test_live_ollama_defaults():
    settings = load_settings(LIVE)
    assert settings.llm_mode == "live"
    assert settings.llm_provider == "ollama"
    assert settings.llm_base_url == "http://host.docker.internal:11434"  # без хвостового /
    assert settings.llm_model == "qwen3.5:9b"
    # Окно контекста явное и не зависит от настроек Ollama на машине.
    assert settings.llm_num_ctx == 16384
    assert settings.llm_max_output_tokens == 400
    assert settings.llm_keep_alive == "30m"


def test_live_limits_from_env():
    env = {**LIVE, "LLM_NUM_CTX": "8192", "LLM_MAX_OUTPUT_TOKENS": "300", "LLM_KEEP_ALIVE": "-1m"}
    settings = load_settings(env)
    assert settings.llm_num_ctx == 8192
    assert settings.llm_max_output_tokens == 300
    assert settings.llm_keep_alive == "-1m"


@pytest.mark.parametrize(
    "extra",
    [
        {"LLM_BASE_URL": ""},
        {"LLM_MODEL": ""},
        {"LLM_PROVIDER": "openai"},
        {"LLM_NUM_CTX": "abc"},
        {"LLM_NUM_CTX": "0"},
        {"LLM_NUM_CTX": "2048"},
        {"LLM_MAX_OUTPUT_TOKENS": "-5"},
        {"LLM_NUM_CTX": "4096", "LLM_MAX_OUTPUT_TOKENS": "2048"},
    ],
)
def test_bad_live_configuration_stops_startup(extra):
    with pytest.raises(ConfigError):
        load_settings({**LIVE, **extra})


def test_knowledge_and_embedding_defaults_survive_empty_compose_values():
    # compose передаёт незаданные EMBEDDING_* пустой строкой.
    settings = load_settings({**LIVE, "EMBEDDING_MODEL": "", "EMBEDDING_DIM": ""})
    assert settings.embedding_model == "bge-m3"
    assert settings.knowledge_source == "files"
    env = {**LIVE, "EMBEDDING_DIM": "1024", "KNOWLEDGE_SOURCE": "db"}
    assert load_settings(env).knowledge_source == "db"


@pytest.mark.parametrize("extra", [{"EMBEDDING_DIM": "768"}, {"KNOWLEDGE_SOURCE": "s3"}])
def test_bad_knowledge_settings_stop_startup(extra):
    with pytest.raises(ConfigError):
        load_settings({**LIVE, **extra})
