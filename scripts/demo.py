"""Offline rehearsal in a separate Compose project; never deletes volumes.

Uses synthetic .env.example explicitly. Cached-image mode is reported separately
from a fresh production build and requires an explicit local overlay.
"""

import argparse
import os
import re
import subprocess
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
        for image in (
            "ai-buddy-tl-20261111-contract-image-tests:latest",
            "ai-buddy-tl-20261111-frontend:latest",
            "ai-buddy-demo-go-build:local",
            "ai-buddy-be-v2-api:local",
        ):
            subprocess.run(
                ["docker", "image", "inspect", image], stdout=subprocess.DEVNULL, check=True
            )
        command += ["-f", str(ROOT / "compose.offline.yaml")]
        print(
            "OFFLINE dependency-cache build; current sources are copied into new images.",
            flush=True,
        )
    if args.action == "up":
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
    subprocess.run(command, env=env, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
