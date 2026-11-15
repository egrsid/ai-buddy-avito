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
import json
import math
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

from scripts.demo import compose, offline_images_present, port_problems

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
LIVE_EVAL_REPORT = "/tmp/v4-revision-live.md"


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


def key_problems(values: dict, opener=None) -> list[str]:
    """Бесплатный GET /models: неверный ключ или имя модели видны до сборки и платных вызовов.

    Прокси системы не используется (как и в сервисе); ключ и тело ответа не печатаются.
    """
    opener = opener or urllib.request.build_opener(urllib.request.ProxyHandler({})).open
    request = urllib.request.Request(
        values["LLM_BASE_URL"].rstrip("/") + "/models",
        headers={"Authorization": "Bearer " + values["LLM_API_KEY"]},
    )
    try:
        with opener(request, timeout=8) as response:
            catalog = {
                item["id"]: item.get("metadata") or {} for item in json.load(response)["data"]
            }
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            return [f"провайдер отклонил LLM_API_KEY (HTTP {error.code})"]
        return [f"список моделей не получен (HTTP {error.code})"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        return [f"провайдер недоступен: {type(error).__name__} (сеть, прокси, LLM_BASE_URL)"]
    names = ("LLM_MODEL", "LLM_FALLBACK_MODEL", "EMBEDDING_MODEL")
    problems = [
        f"модели {values[name]} ({name}) нет в каталоге провайдера"
        for name in names
        if values.get(name) and values[name] not in catalog
    ]
    return problems or price_problems(values, catalog)


# Какая цена в env-файле соответствует какому полю каталога Cloud.ru (₽ за 1 млн токенов).
PRICES = (
    ("LLM_MODEL", "LLM_PRICE_INPUT_RUB", "prompt_tokens_cost"),
    ("LLM_MODEL", "LLM_PRICE_OUTPUT_RUB", "generated_tokens_cost"),
    ("LLM_FALLBACK_MODEL", "LLM_FALLBACK_PRICE_INPUT_RUB", "prompt_tokens_cost"),
    ("LLM_FALLBACK_MODEL", "LLM_FALLBACK_PRICE_OUTPUT_RUB", "generated_tokens_cost"),
    ("EMBEDDING_MODEL", "EMBEDDING_PRICE_RUB", "prompt_tokens_cost"),
)


def price_problems(values: dict, catalog: dict) -> list[str]:
    """Цена ниже каталожной занижает журнал расходов, и автостоп сработает позже, чем должен.

    Цена выше каталожной безопасна (журнал считает с запасом) и не мешает запуску.
    Каталог без цены (другой провайдер) не проверяется.
    """
    problems = []
    for model_name, price_name, field in PRICES:
        model = values.get(model_name)
        if not model or not values.get(price_name):
            continue
        listed = catalog.get(model, {}).get(field)
        if not isinstance(listed, (int, float)):
            continue
        if float(values[price_name]) < float(listed):
            problems.append(
                f"{price_name}={values[price_name]} ниже цены каталога {listed} ({model})"
            )
    return problems


# Остаток бюджета читается из того же журнала, которым пользуется ai-service.
BUDGET_STATUS = (
    "import json,os; from app.budget import BudgetLedger; "
    "print(json.dumps(BudgetLedger(os.environ['LLM_BUDGET_LEDGER_PATH'],0).status()))"
)


def budget_warning(command: list[str], env: dict, values: dict) -> str | None:
    """Журнал общий для машины: при расходах выше стопа модель не вызывается вовсе."""
    try:
        result = subprocess.run(
            command + ["exec", "-T", "ai-service", "python", "-c", BUDGET_STATUS],
            env=env,
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
        spent = float(json.loads(result.stdout)["spent_rub"])
    except (OSError, subprocess.CalledProcessError, ValueError, KeyError, TypeError):
        return None
    stop = float(values.get("LLM_BUDGET_STOP_RUB") or 800)
    if spent < stop:
        return f"Журнал расходов: потрачено {spent:.2f} ₽ из стоп-порога {stop:g} ₽."
    return (
        f"Внимание: в журнале расходов уже {spent:.2f} ₽ при LLM_BUDGET_STOP_RUB={stop:g} — "
        "платные вызовы запрещены, ответы будут резервными без ИИ, поиск — по словам. "
        "Поднимите LLM_BUDGET_STOP_RUB (не больше 800) и повторите up."
    )


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
    values = read_env_file(env_file)
    problems = config_problems(values)
    if not problems and args.action == "check":
        problems = key_problems(values)
    if problems and args.action in ("up", "check", "evals"):
        print(f"Live-демо не запущено, исправь {env_file.name}:")
        for problem in problems:
            print(" -", problem)
        return 2
    if args.action == "check":
        print(f"Настройки live в {env_file.name} в порядке, ключ и модели приняты провайдером.")
        return 0
    cached = args.cached_build and offline_images_present()
    if args.cached_build and not cached:
        print("Кэша зависимостей нет на этой машине: обычная сборка из сети.")
    command, env = configuration(args.project, env_file, cached)
    if args.action == "up":
        busy = port_problems(
            args.project,
            {"сайт": int(env["FRONTEND_PORT"]), "Go API": int(env["BACKEND_PORT"])},
            f"Остановите тот стенд или впишите в {env_file.name} свободные FRONTEND_PORT и "
            "BACKEND_PORT (сайт откроется на FRONTEND_PORT); для повторной проверки возьмите "
            "своё имя --project ai-buddy-live-<имя>.",
        )
        if busy:
            print("Live-демо не запущено:", *busy, sep="\n - ", file=sys.stderr)
            return 2
        compose(command + ["up", "--build", "-d", "--wait"], env, "поднять live-стенд")
        print(f"\nГотово: откройте {env['APP_ORIGIN']} (источник ответа указан в интерфейсе).")
        warning = budget_warning(command, env, values)
        if warning:
            print(warning)
        return 0
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
            "--output",
            LIVE_EVAL_REPORT,
        ]
    elif args.action == "down":
        command += ["down"]
    else:
        command += ["ps", "-a"]
    completed = subprocess.run(command, env=env, cwd=ROOT, check=args.action != "evals")
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
        return completed.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
