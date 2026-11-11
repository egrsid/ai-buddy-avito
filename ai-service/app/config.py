"""Настройки AI-сервиса из переменных окружения.

Ошибка конфигурации останавливает старт: лучше не подняться, чем тихо включить
тестовые сбои или несуществующий live-режим.
"""

from collections.abc import Mapping
from dataclasses import dataclass

APP_ENVS = ("local", "test", "production")
LLM_MODES = ("mock",)  # live появится в RP-AI-02


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


def parse_bool(name: str, value: str) -> bool:
    if value == "true":
        return True
    if value == "false":
        return False
    raise ConfigError(f"{name} должен быть true или false")


def load_settings(env: Mapping[str, str]) -> Settings:
    token = env.get("INTERNAL_API_TOKEN", "")
    if not token:
        raise ConfigError("INTERNAL_API_TOKEN не задан")

    app_env = env.get("APP_ENV", "production")
    if app_env not in APP_ENVS:
        raise ConfigError(f"APP_ENV должен быть одним из {APP_ENVS}")

    llm_mode = env.get("LLM_MODE", "mock")
    if llm_mode == "live":
        raise ConfigError("LLM_MODE=live ещё не поддерживается, используйте mock")
    if llm_mode not in LLM_MODES:
        raise ConfigError(f"LLM_MODE должен быть одним из {LLM_MODES}")

    faults = parse_bool("MOCK_FAULTS_ENABLED", env.get("MOCK_FAULTS_ENABLED", "false"))
    if faults and app_env not in ("local", "test"):
        raise ConfigError("MOCK_FAULTS_ENABLED=true разрешён только при APP_ENV=local или test")

    return Settings(
        internal_api_token=token,
        app_env=app_env,
        llm_mode=llm_mode,
        mock_faults_enabled=faults,
    )
