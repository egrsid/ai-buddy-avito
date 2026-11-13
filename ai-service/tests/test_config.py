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
        # Жёсткий потолок ответа — 1000 токенов.
        {"LLM_MAX_OUTPUT_TOKENS": "1001"},
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


def test_query_embeddings_on_by_default_and_can_be_switched_off():
    assert load_settings(LIVE).query_embeddings is True
    assert load_settings({**LIVE, "QUERY_EMBEDDINGS": "off"}).query_embeddings is False


@pytest.mark.parametrize(
    "extra",
    [{"EMBEDDING_DIM": "768"}, {"KNOWLEDGE_SOURCE": "s3"}, {"QUERY_EMBEDDINGS": "yes"}],
)
def test_bad_knowledge_settings_stop_startup(extra):
    with pytest.raises(ConfigError):
        load_settings({**LIVE, **extra})


PAID = {
    **LIVE,
    "LLM_PROVIDER": "openai",
    "LLM_BASE_URL": "https://foundation-models.example/v1",
    "LLM_MODEL": "ai-sage/GigaChat3.5-432B-A28B",
    "LLM_API_KEY": "secret-key",
    "LLM_BUDGET_LEDGER_PATH": "/var/lib/ai-budget/budget.sqlite",
    "LLM_PRICE_INPUT_RUB": "96.22",
    "LLM_PRICE_OUTPUT_RUB": "288.60",
    "EMBEDDING_PRICE_RUB": "0.61",
}


def test_paid_api_settings():
    settings = load_settings(PAID)
    assert settings.llm_provider == "openai"
    assert settings.budget_stop_rub == 800.0
    assert settings.price_input_rub == 96.22
    assert settings.price_output_rub == 288.60
    assert settings.price_embedding_rub == 0.61
    assert load_settings({**PAID, "LLM_BUDGET_STOP_RUB": "100"}).budget_stop_rub == 100.0
    assert settings.llm_reasoning_effort == ""
    env = {**PAID, "LLM_REASONING_EFFORT": "none"}
    assert load_settings(env).llm_reasoning_effort == "none"


def test_api_key_is_not_in_settings_repr():
    assert "secret-key" not in repr(load_settings(PAID))


@pytest.mark.parametrize(
    "name",
    [
        "LLM_API_KEY",
        "LLM_BUDGET_LEDGER_PATH",
        "LLM_PRICE_INPUT_RUB",
        "LLM_PRICE_OUTPUT_RUB",
        "EMBEDDING_PRICE_RUB",
    ],
)
def test_paid_api_without_key_ledger_or_tariff_stops_startup(name):
    with pytest.raises(ConfigError):
        load_settings({**PAID, name: ""})


@pytest.mark.parametrize("value", ["abc", "0", "-1", "nan", "inf"])
def test_bad_tariff_or_stop_stops_startup(value):
    with pytest.raises(ConfigError):
        load_settings({**PAID, "LLM_PRICE_INPUT_RUB": value})
    with pytest.raises(ConfigError):
        load_settings({**PAID, "LLM_BUDGET_STOP_RUB": value})


def test_ollama_does_not_need_paid_settings():
    assert load_settings({**LIVE, "LLM_PROVIDER": "ollama"}).llm_api_key == ""


def test_empty_compose_values_mean_defaults():
    env = {**LIVE, "LLM_PROVIDER": "", "LLM_NUM_CTX": "", "LLM_MAX_OUTPUT_TOKENS": ""}
    settings = load_settings({**env, "LLM_KEEP_ALIVE": "", "LLM_BUDGET_STOP_RUB": ""})
    assert settings.llm_provider == "ollama"
    assert settings.llm_num_ctx == 16384
    assert settings.llm_max_output_tokens == 400
    assert settings.llm_keep_alive == "30m"
