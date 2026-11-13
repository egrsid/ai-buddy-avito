"""Демо с настоящей LLM: тот же изолированный v2-стенд, что `make demo-up`, но live.

`make demo-up` / `main-demo` намеренно всегда offline (mock), поэтому в них отвечает
шаблон, а не модель. Этот запуск:
- берёт настройки только из `.env` и до старта Docker проверяет, что там live-режим,
  ключ, модели и цены. Ошибка конфигурации — понятное сообщение до платного вызова;
- убирает LLM_* из окружения оболочки: Compose предпочитает их файлу `.env`, и случайный
  `LLM_MODE=mock` в терминале молча превратил бы live-демо в mock;
- пишет в общий журнал расходов (compose.live.yaml), бюджет не начинается с нуля.
Значения из `.env` (ключ) не печатаются никогда — только имена переменных.
"""

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILES = ("compose.yaml", "compose.mvp.yaml", "compose.demo.yaml", "compose.live.yaml")
# Без них live-цепочка не стартует или журнал расходов не знает цену вызова.
REQUIRED = (
    "LLM_PROVIDER",
    "LLM_BASE_URL",
    "LLM_MODEL",
    "LLM_API_KEY",
    "LLM_PRICE_INPUT_RUB",
    "LLM_PRICE_OUTPUT_RUB",
    "EMBEDDING_MODEL",
)
FALLBACK_PRICES = ("LLM_FALLBACK_PRICE_INPUT_RUB", "LLM_FALLBACK_PRICE_OUTPUT_RUB")
# Переменные оболочки, которые не должны перебивать `.env`.
INHERITED_PREFIXES = ("LLM_", "EMBEDDING_", "QUERY_EMBEDDINGS", "MOCK_", "AI_MOCK_")


def read_env_file(path: Path) -> dict:
    """Простые строки KEY=VALUE; комментарии и пустые строки пропускаем."""
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


def config_problems(values: dict) -> list[str]:
    """Что не так с live-настройками. Пустой список — можно запускать."""
    problems = []
    if values.get("LLM_MODE") != "live":
        problems.append("LLM_MODE должен быть live")
    if values.get("LLM_PROVIDER", "openai") != "openai":
        problems.append("LLM_PROVIDER должен быть openai (Cloud.ru)")
    for name in REQUIRED:
        if not values.get(name):
            problems.append(f"не задан {name}")
    if values.get("LLM_FALLBACK_MODEL"):
        for name in FALLBACK_PRICES:
            if not values.get(name):
                problems.append(f"задан LLM_FALLBACK_MODEL, но не задан {name}")
    return problems


def configuration(project: str, env_file: Path):
    if not re.fullmatch(r"ai-buddy-live-[a-z0-9-]+", project):
        raise ValueError("Используй отдельный проект ai-buddy-live-*")
    env = {
        key: value for key, value in os.environ.items() if not key.startswith(INHERITED_PREFIXES)
    }
    env.update(
        {
            "APP_ENV": "local",
            "APP_ORIGIN": "http://localhost:15173",
            "BACKEND_PORT": "18080",
            "FRONTEND_PORT": "15173",
            "MOCK_FAULTS_ENABLED": "false",
            "AI_MOCK_SCENARIO": "normal",
        }
    )
    command = ["docker", "compose", "--env-file", str(env_file), "-p", project]
    for name in COMPOSE_FILES:
        command += ["-f", str(ROOT / name)]
    return command, env


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("up", "down", "status", "check"))
    parser.add_argument("--project", default="ai-buddy-live-local")
    parser.add_argument("--env-file", default=str(ROOT / ".env"))
    args = parser.parse_args(argv)
    env_file = Path(args.env_file)
    if not env_file.is_file():
        print(f"Нет файла {env_file}: скопируй .env.example в .env и впиши ключ.")
        return 2
    problems = config_problems(read_env_file(env_file))
    if problems and args.action in ("up", "check"):
        print("Live-демо не запущено, исправь .env:")
        for problem in problems:
            print(" -", problem)
        return 2
    if args.action == "check":
        print("Настройки live в .env в порядке.")
        return 0
    command, env = configuration(args.project, env_file)
    if args.action == "up":
        command += ["up", "--build", "-d", "--wait"]
    elif args.action == "down":
        command += ["down"]
    else:
        command += ["ps", "-a"]
    subprocess.run(command, env=env, cwd=ROOT, check=True)
    if args.action == "up":
        print("Live-демо: http://localhost:15173 (ответы модели GigaChat, fallback — с пометкой).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
