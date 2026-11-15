"""Offline rehearsal in a separate Compose project; never deletes volumes.

Uses synthetic .env.example explicitly. Cached-image mode is reported separately
from a fresh production build and requires an explicit local overlay.
"""

import argparse
import os
import re
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def configuration(project: str, cached_overlay: str | None = None):
    if not re.fullmatch(r"ai-buddy-demo-[a-z0-9-]+", project):
        raise ValueError("Use a separate ai-buddy-demo-* project, never the legacy project")
    frontend_port = int(os.environ.get("DEMO_FRONTEND_PORT", "15173"))
    backend_port = int(os.environ.get("DEMO_BACKEND_PORT", "18080"))
    if not all(1024 <= port <= 65535 for port in (frontend_port, backend_port)):
        raise ValueError("Demo ports must be between 1024 and 65535")
    env = {
        **os.environ,
        "APP_ENV": "local",
        "APP_ORIGIN": f"http://localhost:{frontend_port}",
        "BACKEND_PORT": str(backend_port),
        "FRONTEND_PORT": str(frontend_port),
        "LLM_MODE": "mock",
        "LLM_API_KEY": "",
        "MOCK_FAULTS_ENABLED": "false",
        "AI_MOCK_SCENARIO": "normal",
    }
    command = ["docker", "compose", "--env-file", str(ROOT / ".env.example"), "-p", project]
    for name in ("compose.yaml", "compose.mvp.yaml", "compose.demo.yaml"):
        command += ["-f", str(ROOT / name)]
    if cached_overlay:
        command += ["-f", str(Path(cached_overlay).resolve(strict=True))]
    return command, env


def port_is_free(port: int) -> bool:
    """Compose publishes on 127.0.0.1; a successful bind there means nobody holds the port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def port_owner(port: int) -> str | None:
    """Compose project of the running container that publishes the port, if any."""
    try:
        listing = subprocess.run(
            ["docker", "ps", "--format", '{{.Label "com.docker.compose.project"}}\t{{.Ports}}'],
            capture_output=True,
            text=True,
            check=False,
        ).stdout
    except OSError:
        return None
    for line in listing.splitlines():
        project, _, ports = line.partition("\t")
        if re.search(rf":{port}->", ports):
            return project or "без имени проекта"
    return None


def port_problems(project: str, ports: dict[str, int], hint: str) -> list[str]:
    """Busy ports before `up`: a half-started second stand is worse than a clear refusal."""
    problems = []
    for name, port in ports.items():
        if port_is_free(port):
            continue
        owner = port_owner(port)
        if owner == project:
            continue  # this stand is already running; `up` just updates it
        holder = f"стендом {owner}" if owner else "другой программой"
        problems.append(f"Порт {port} ({name}) занят {holder}.")
    if problems:
        problems.append(hint)
    return problems


def compose(command: list[str], env: dict, action: str) -> None:
    """Run Compose; on failure a short hint instead of a Python traceback."""
    try:
        subprocess.run(command, env=env, cwd=ROOT, check=True)
    except subprocess.CalledProcessError as error:
        print(
            f"\nНе удалось {action}: причина в сообщении Docker выше.\n"
            "Частые причины: Docker Desktop не запущен; порт занят другим стендом "
            "(docker ps); нет сети для первой сборки образов.\n"
            "Если стенд остался наполовину запущенным, повторите с новым именем проекта "
            "(--project ...) или пересоздайте контейнеры: та же команда Compose с "
            "`up -d --wait --force-recreate`.",
            file=sys.stderr,
        )
        raise SystemExit(error.returncode) from error


# Dependency images that compose.offline.yaml builds from; they exist only after one online build.
OFFLINE_IMAGES = (
    "ai-buddy-tl-20261111-contract-image-tests:latest",
    "ai-buddy-tl-20261111-frontend:latest",
    "ai-buddy-demo-go-build:local",
    "ai-buddy-be-v2-api:local",
)


def offline_images_present() -> bool:
    """True when every cached dependency image for compose.offline.yaml is available."""
    for image in OFFLINE_IMAGES:
        found = subprocess.run(
            ["docker", "image", "inspect", image],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if found.returncode != 0:
            return False
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action", choices=("up", "down", "status", "restart", "ai-db-test", "api-test")
    )
    parser.add_argument("--project", default="ai-buddy-demo-local")
    parser.add_argument("--cached-overlay")
    parser.add_argument(
        "--offline", action="store_true", help="Rebuild from locally cached dependencies"
    )
    args = parser.parse_args()
    command, env = configuration(args.project, args.cached_overlay)
    if args.offline:
        for image in OFFLINE_IMAGES:
            subprocess.run(
                ["docker", "image", "inspect", image], stdout=subprocess.DEVNULL, check=True
            )
        command += ["-f", str(ROOT / "compose.offline.yaml")]
        print(
            "OFFLINE dependency-cache build; current sources are copied into new images.",
            flush=True,
        )
    if args.action == "up":
        ports = {"сайт": int(env["FRONTEND_PORT"]), "Go API": int(env["BACKEND_PORT"])}
        problems = port_problems(
            args.project,
            ports,
            f"Остановите тот стенд (python -m scripts.demo down --project <имя>) или задайте "
            f"другие порты: DEMO_FRONTEND_PORT=15175 DEMO_BACKEND_PORT=18082 "
            f"python -m scripts.demo up --project {args.project}",
        )
        if problems:
            print("Стенд не запущен:", *problems, sep="\n - ", file=sys.stderr)
            raise SystemExit(2)
        command += ["up", "--no-build" if args.cached_overlay else "--build", "-d", "--wait"]
    elif args.action == "down":
        command += ["down"]
    elif args.action == "status":
        command += ["ps", "-a"]
    elif args.action == "restart":
        # Drain the consumer before restarting its dependencies. Otherwise a
        # browser read can observe a temporarily unavailable IAM during restart.
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
    elif args.action == "ai-db-test":
        command += ["--profile", "acceptance", "run", "--rm", "--no-deps"]
        if not args.cached_overlay:
            command += ["--build"]
        command += ["ai-db-tests"]
    else:
        command += [
            "--profile",
            "acceptance",
            "run",
            "--rm",
            "--no-deps",
            *([] if args.cached_overlay else ["--build"]),
            "-e",
            "BACKEND_ACCEPTANCE_URL=http://backend:8080",
            "-e",
            "APP_ORIGIN=http://localhost:15173",
            "-e",
            "AI_ACCEPTANCE=1",
            "ai-db-tests",
            "python",
            "-m",
            "scripts.backend_acceptance",
        ]
    if args.cached_overlay:
        print("CACHED-IMAGE rehearsal; clean production build is not verified.", flush=True)
    compose(command, env, "поднять стенд" if args.action == "up" else f"выполнить {args.action}")
    if args.action == "up":
        print(
            f"\nГотово: откройте {env['APP_ORIGIN']} (Go API: http://localhost:"
            f"{env['BACKEND_PORT']}). Ответы без ключа — шаблоны с меткой «Демо · без LLM»."
        )


if __name__ == "__main__":
    main()
