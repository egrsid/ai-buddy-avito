"""Настройки AI-сервиса из переменных окружения.

Ошибка конфигурации останавливает старт: лучше не подняться, чем тихо включить
тестовые сбои или недонастроенный live-режим.
"""

from collections.abc import Mapping
from dataclasses import dataclass

APP_ENVS = ("local", "test", "production")
LLM_MODES = ("mock", "live")
LLM_PROVIDERS = ("ollama",)  # openai (/v1, платный API) появится позже
# Окно контекста задаём сами: дефолт Ollama (4096) зависит от машины и молча режет промпт.
DEFAULT_NUM_CTX = 16384
MIN_NUM_CTX = 4096
DEFAULT_MAX_OUTPUT_TOKENS = 400
# Размерность зафиксирована миграцией kb 002 (bge-m3): другая модель — новая миграция.
EMBEDDING_DIM = 1024
# files — корпус из data/knowledge/v2 в памяти (тесты, офлайн); db — индекс kb после ingest.
KNOWLEDGE_SOURCES = ("files", "db")


class ConfigError(Exception):
    """Недопустимая конфигурация: сервис не должен стартовать."""


@dataclass(frozen=True)
class Settings:
    internal_api_token: str
    app_env: str = "production"
    llm_mode: str = "mock"
    mock_faults_enabled: bool = False
    # Таймеры в секундах (ai-integration-policy.md, раздел 2).
    first_token_timeout: float = 20.0
    stream_idle_timeout: float = 25.0
    pipeline_timeout: float = 85.0
    ping_interval: float = 10.0
    # Пауза между кусками текста в сценарии slow_stream.
    slow_stream_delay: float = 1.0
    # Live LLM (LLM_MODE=live).
    llm_provider: str = "ollama"
    llm_base_url: str = ""
    llm_model: str = ""
    llm_num_ctx: int = DEFAULT_NUM_CTX
    llm_max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS
    # Сколько Ollama держит модель в памяти после запроса (её дефолт — 5 минут).
    llm_keep_alive: str = "30m"
    # Эмбеддинги (live) берутся у той же Ollama, что и чат.
    embedding_model: str = "bge-m3"
    knowledge_source: str = "files"


def parse_bool(name: str, value: str) -> bool:
    if value == "true":
        return True
    if value == "false":
        return False
    raise ConfigError(f"{name} должен быть true или false")


def parse_positive_int(name: str, value: str) -> int:
    if not value.isdigit() or int(value) == 0:
        raise ConfigError(f"{name} должен быть целым числом больше 0")
    return int(value)


def load_settings(env: Mapping[str, str]) -> Settings:
    token = env.get("INTERNAL_API_TOKEN", "")
    if not token:
        raise ConfigError("INTERNAL_API_TOKEN не задан")

    app_env = env.get("APP_ENV", "production")
    if app_env not in APP_ENVS:
        raise ConfigError(f"APP_ENV должен быть одним из {APP_ENVS}")

    llm_mode = env.get("LLM_MODE", "mock")
    if llm_mode not in LLM_MODES:
        raise ConfigError(f"LLM_MODE должен быть одним из {LLM_MODES}")

    faults = parse_bool("MOCK_FAULTS_ENABLED", env.get("MOCK_FAULTS_ENABLED", "false"))
    if faults and app_env not in ("local", "test"):
        raise ConfigError("MOCK_FAULTS_ENABLED=true разрешён только при APP_ENV=local или test")

    provider = env.get("LLM_PROVIDER", "ollama")
    if provider not in LLM_PROVIDERS:
        raise ConfigError(f"LLM_PROVIDER должен быть одним из {LLM_PROVIDERS}")
    base_url = env.get("LLM_BASE_URL", "").rstrip("/")
    model = env.get("LLM_MODEL", "")
    if llm_mode == "live" and (not base_url or not model):
        raise ConfigError("Для LLM_MODE=live нужны LLM_BASE_URL и LLM_MODEL")

    num_ctx = parse_positive_int("LLM_NUM_CTX", env.get("LLM_NUM_CTX", str(DEFAULT_NUM_CTX)))
    if num_ctx < MIN_NUM_CTX:
        raise ConfigError(f"LLM_NUM_CTX должен быть не меньше {MIN_NUM_CTX}")
    max_output = parse_positive_int(
        "LLM_MAX_OUTPUT_TOKENS", env.get("LLM_MAX_OUTPUT_TOKENS", str(DEFAULT_MAX_OUTPUT_TOKENS))
    )
    if max_output >= num_ctx // 2:
        raise ConfigError("LLM_MAX_OUTPUT_TOKENS должен быть меньше половины LLM_NUM_CTX")

    # compose передаёт незаданные переменные пустой строкой: пусто = дефолт.
    embedding_model = env.get("EMBEDDING_MODEL") or "bge-m3"
    dimensions = env.get("EMBEDDING_DIM") or str(EMBEDDING_DIM)
    if dimensions != str(EMBEDDING_DIM):
        raise ConfigError(f"EMBEDDING_DIM должен быть {EMBEDDING_DIM}: так задано в миграции kb")
    knowledge_source = env.get("KNOWLEDGE_SOURCE") or "files"
    if knowledge_source not in KNOWLEDGE_SOURCES:
        raise ConfigError(f"KNOWLEDGE_SOURCE должен быть одним из {KNOWLEDGE_SOURCES}")

    return Settings(
        internal_api_token=token,
        app_env=app_env,
        llm_mode=llm_mode,
        mock_faults_enabled=faults,
        llm_provider=provider,
        llm_base_url=base_url,
        llm_model=model,
        llm_num_ctx=num_ctx,
        llm_max_output_tokens=max_output,
        llm_keep_alive=env.get("LLM_KEEP_ALIVE", "30m"),
        embedding_model=embedding_model,
        knowledge_source=knowledge_source,
    )
