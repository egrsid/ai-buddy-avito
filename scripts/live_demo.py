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
import math
import os
import re
import subprocess
import sys
from pathlib import Path

from scripts.demo import offline_images_present

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
    "EMBEDDING_PRICE_RUB",
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


# The image's evals/ folder is read-only for the service user; /tmp is writable.
LIVE_EVAL_REPORT = "/tmp/report-revision-draft-live.md"


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
    prices = ("LLM_PRICE_INPUT_RUB", "LLM_PRICE_OUTPUT_RUB", "EMBEDDING_PRICE_RUB")
    for name in (*prices, "LLM_BUDGET_STOP_RUB"):
        try:
            value = float(values.get(name, "800" if name == "LLM_BUDGET_STOP_RUB" else ""))
            if (
                not math.isfinite(value)
                or value <= 0
                or (name == "LLM_BUDGET_STOP_RUB" and value > 800)
            ):
                raise ValueError
        except ValueError:
            problems.append(f"недопустимый {name}")
    if values.get("LLM_FALLBACK_MODEL"):
        for name in FALLBACK_PRICES:
            if not values.get(name):
                problems.append(f"задан LLM_FALLBACK_MODEL, но не задан {name}")
    return problems


def configuration(project: str, env_file: Path, cached_build: bool = False):
    if not re.fullmatch(r"ai-buddy-live-[a-z0-9-]+", project):
        raise ValueError("Используй отдельный проект ai-buddy-live-*")
    values = read_env_file(env_file) if env_file.is_file() else {}
    frontend_port = int(values.get("FRONTEND_PORT") or "15173")
    backend_port = int(values.get("BACKEND_PORT") or "18080")
    if not all(1024 <= port <= 65535 for port in (frontend_port, backend_port)):
        raise ValueError("Порты должны быть между 1024 и 65535")
    if frontend_port == backend_port:
        raise ValueError("Frontend и backend должны иметь разные порты")
    env = {
        key: value for key, value in os.environ.items() if not key.startswith(INHERITED_PREFIXES)
    }
    env.update(
        {
            "APP_ENV": "local",
            "APP_ORIGIN": f"http://localhost:{frontend_port}",
            "BACKEND_PORT": str(backend_port),
            "FRONTEND_PORT": str(frontend_port),
            "MOCK_FAULTS_ENABLED": "false",
            "AI_MOCK_SCENARIO": "normal",
        }
    )
    command = ["docker", "compose", "--env-file", str(env_file), "-p", project]
    for name in COMPOSE_FILES:
        command += ["-f", str(ROOT / name)]
    if cached_build:
        # This affects dependency images only. compose.live must remain last: the
        # provider still receives real requests, with the persistent budget ledger.
        command[-2:-2] = ["-f", str(ROOT / "compose.offline.yaml")]
    return command, env


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action", choices=("up", "down", "status", "check", "restart", "budget", "evals")
    )
    parser.add_argument("--project", default="ai-buddy-live-local")
    parser.add_argument("--env-file", default=str(ROOT / ".env"))
    parser.add_argument("--cached-build", action="store_true")
    args = parser.parse_args(argv)
    env_file = Path(args.env_file)
    if not env_file.is_file():
        print(f"Нет файла {env_file}: скопируй .env.example в .env и впиши ключ.")
        return 2
    problems = config_problems(read_env_file(env_file))
    if problems and args.action in ("up", "check", "evals"):
        print("Live-демо не запущено, исправь .env:")
        for problem in problems:
            print(" -", problem)
        return 2
    if args.action == "check":
        print("Настройки live в .env в порядке.")
        return 0
    cached = args.cached_build and offline_images_present()
    if args.cached_build and not cached:
        print("Кэша зависимостей нет на этой машине: обычная сборка из сети.")
    command, env = configuration(args.project, env_file, cached)
    if args.action == "up":
        command += ["up", "--build", "-d", "--wait"]
    elif args.action == "restart":
        subprocess.run(command + ["stop", "backend"], env=env, cwd=ROOT, check=True)
        subprocess.run(
            command + ["restart", "ai-service", "mock-services"], env=env, cwd=ROOT, check=True
        )
        subprocess.run(
            command
            + ["up", "--no-build", "--no-deps", "-d", "--wait", "ai-service", "mock-services"],
            env=env,
            cwd=ROOT,
            check=True,
        )
        command += ["up", "--no-build", "--no-deps", "-d", "--wait", "backend"]
    elif args.action == "budget":
        command += ["exec", "-T", "ai-service", "python", "-m", "app.budget", "status"]
    elif args.action == "evals":
        command += [
            "exec",
            "-T",
            "ai-service",
            "python",
            "-m",
            "app.revision_draft_evals",
            "--live",
            "--report",
            LIVE_EVAL_REPORT,
        ]
    elif args.action == "down":
        command += ["down"]
    else:
        command += ["ps", "-a"]
    subprocess.run(command, env=env, cwd=ROOT, check=True)
    if args.action == "evals":
        output = ROOT / ".cache" / "v4-revision-live.md"
        output.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "docker",
                "cp",
                f"{args.project}-ai-service-1:{LIVE_EVAL_REPORT}",
                str(output),
            ],
            check=True,
        )
    if args.action == "up":
        print(f"Live-демо: {env['APP_ORIGIN']} (источник ответа указан в интерфейсе).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
