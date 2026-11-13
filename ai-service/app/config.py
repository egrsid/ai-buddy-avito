"""Настройки AI-сервиса из переменных окружения.

Ошибка конфигурации останавливает старт: лучше не подняться, чем тихо включить
тестовые сбои или недонастроенный live-режим.
"""

import math
from collections.abc import Mapping
from dataclasses import dataclass, field

APP_ENVS = ("local", "test", "production")
LLM_MODES = ("mock", "live")
# ollama — локальная модель (нативный /api/chat); openai — OpenAI-совместимый /v1
# платного API (Cloud.ru), с ключом и учётом расходов.
LLM_PROVIDERS = ("ollama", "openai")
# Окно контекста задаём сами: дефолт Ollama (4096) зависит от машины и молча режет промпт.
DEFAULT_NUM_CTX = 16384
MIN_NUM_CTX = 4096
DEFAULT_MAX_OUTPUT_TOKENS = 400
# Жёсткий потолок ответа: дороже выходные токены, и от него считается резерв бюджета.
MAX_OUTPUT_CAP = 1000
# Автостоп платных вызовов (бюджет хакатона 1000 ₽, 200 ₽ — резерв на расхождения).
DEFAULT_BUDGET_STOP_RUB = 800.0
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
    # Платный API (LLM_PROVIDER=openai). Ключ не попадает в repr и логи.
    llm_api_key: str = field(default="", repr=False)
    budget_ledger_path: str = ""
    # reasoning_effort для /v1. Пусто — параметр не отправляем (Cloud.ru, модель без
    # рассуждений). none — выключить «размышления» у Ollama /v1, иначе они съедают лимит.
    llm_reasoning_effort: str = ""
    budget_stop_rub: float = DEFAULT_BUDGET_STOP_RUB
    # Тарифы, ₽ за 1 млн токенов. Неизвестный тариф — сервис не стартует.
    price_input_rub: float = 0.0
    price_output_rub: float = 0.0
    price_embedding_rub: float = 0.0
    # Optional second model on the same OpenAI-compatible endpoint and budget ledger.
    llm_fallback_model: str = ""
    fallback_price_input_rub: float = 0.0
    fallback_price_output_rub: float = 0.0


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


def parse_rub(name: str, value: str) -> float:
    try:
        number = float(value)
    except ValueError:
        raise ConfigError(f"{name} должен быть числом больше 0") from None
    if not math.isfinite(number) or number <= 0:
        raise ConfigError(f"{name} должен быть числом больше 0")
    return number


def load_paid_api(env: Mapping[str, str]) -> dict:
    """Ключ, журнал расходов и тарифы платного API: без любого из них не стартуем."""
    values = {}
    for name in (
        "LLM_API_KEY",
        "LLM_BUDGET_LEDGER_PATH",
        "LLM_PRICE_INPUT_RUB",
        "LLM_PRICE_OUTPUT_RUB",
        "EMBEDDING_PRICE_RUB",
    ):
        if not env.get(name):
            raise ConfigError(f"Для LLM_PROVIDER=openai нужен {name}")
    values["llm_api_key"] = env["LLM_API_KEY"]
    values["budget_ledger_path"] = env["LLM_BUDGET_LEDGER_PATH"]
    values["price_input_rub"] = parse_rub("LLM_PRICE_INPUT_RUB", env["LLM_PRICE_INPUT_RUB"])
    values["price_output_rub"] = parse_rub("LLM_PRICE_OUTPUT_RUB", env["LLM_PRICE_OUTPUT_RUB"])
    values["price_embedding_rub"] = parse_rub("EMBEDDING_PRICE_RUB", env["EMBEDDING_PRICE_RUB"])
    stop = env.get("LLM_BUDGET_STOP_RUB") or str(DEFAULT_BUDGET_STOP_RUB)
    values["budget_stop_rub"] = parse_rub("LLM_BUDGET_STOP_RUB", stop)
    values["llm_reasoning_effort"] = env.get("LLM_REASONING_EFFORT", "")
    fallback = env.get("LLM_FALLBACK_MODEL", "")
    if fallback:
        if fallback == env.get("LLM_MODEL"):
            raise ConfigError("LLM_FALLBACK_MODEL должен отличаться от LLM_MODEL")
        values["llm_fallback_model"] = fallback
        for field_name, variable in (
            ("fallback_price_input_rub", "LLM_FALLBACK_PRICE_INPUT_RUB"),
            ("fallback_price_output_rub", "LLM_FALLBACK_PRICE_OUTPUT_RUB"),
        ):
            values[field_name] = parse_rub(variable, env.get(variable, ""))
    return values


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

    # compose передаёт незаданные переменные пустой строкой: пусто = дефолт.
    provider = env.get("LLM_PROVIDER") or "ollama"
    if provider not in LLM_PROVIDERS:
        raise ConfigError(f"LLM_PROVIDER должен быть одним из {LLM_PROVIDERS}")
    base_url = env.get("LLM_BASE_URL", "").rstrip("/")
    model = env.get("LLM_MODEL", "")
    if llm_mode == "live" and (not base_url or not model):
        raise ConfigError("Для LLM_MODE=live нужны LLM_BASE_URL и LLM_MODEL")

    num_ctx = parse_positive_int("LLM_NUM_CTX", env.get("LLM_NUM_CTX") or str(DEFAULT_NUM_CTX))
    if num_ctx < MIN_NUM_CTX:
        raise ConfigError(f"LLM_NUM_CTX должен быть не меньше {MIN_NUM_CTX}")
    max_output = parse_positive_int(
        "LLM_MAX_OUTPUT_TOKENS", env.get("LLM_MAX_OUTPUT_TOKENS") or str(DEFAULT_MAX_OUTPUT_TOKENS)
    )
    if max_output >= num_ctx // 2:
        raise ConfigError("LLM_MAX_OUTPUT_TOKENS должен быть меньше половины LLM_NUM_CTX")
    if max_output > MAX_OUTPUT_CAP:
        raise ConfigError(f"LLM_MAX_OUTPUT_TOKENS должен быть не больше {MAX_OUTPUT_CAP}")

    embedding_model = env.get("EMBEDDING_MODEL") or "bge-m3"
    dimensions = env.get("EMBEDDING_DIM") or str(EMBEDDING_DIM)
    if dimensions != str(EMBEDDING_DIM):
        raise ConfigError(f"EMBEDDING_DIM должен быть {EMBEDDING_DIM}: так задано в миграции kb")
    knowledge_source = env.get("KNOWLEDGE_SOURCE") or "files"
    if knowledge_source not in KNOWLEDGE_SOURCES:
        raise ConfigError(f"KNOWLEDGE_SOURCE должен быть одним из {KNOWLEDGE_SOURCES}")

    paid = {}
    if llm_mode == "live" and provider == "openai":
        paid = load_paid_api(env)

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
        llm_keep_alive=env.get("LLM_KEEP_ALIVE") or "30m",
        embedding_model=embedding_model,
        knowledge_source=knowledge_source,
        **paid,
    )
