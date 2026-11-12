"""Fail early when an integration checkout is still the legacy bootstrap."""

import os
from pathlib import Path

from scripts.ai_tasks import COMMANDS, command_for

ROOT = Path(__file__).resolve().parents[1]


def blockers(root: Path, environment: dict[str, str]) -> list[str]:
    missing = []
    for folder in ("backend", "ai-service", "mock-services"):
        if len(list((root / folder / "migrations").glob("*.sql"))) < 2:
            missing.append(f"{folder}: target v2 migration not supplied")
    for folder, module in (("ai-service", "app"), ("mock-services", "corporate")):
        business = [
            path
            for path in (root / folder / module).rglob("*.py")
            if path.name not in {"main.py", "__init__.py"}
        ]
        if not business:
            missing.append(f"{folder}: business implementation not supplied")
        if not list((root / folder / "tests").rglob("test_*.py")):
            missing.append(f"{folder}: component tests not supplied")
    if not list((root / "backend/internal").rglob("*.go")):
        missing.append("backend: business implementation not supplied")
    if not list((root / "frontend/e2e").glob("*.spec.ts")):
        missing.append("frontend: browser/API acceptance tests not supplied")
    for task in COMMANDS:
        try:
            command_for(task, environment)
        except ValueError as error:
            missing.append(str(error))
    return missing


def main() -> None:
    missing = blockers(ROOT, dict(os.environ))
    if missing:
        raise SystemExit("MVP preflight BLOCKED:\n- " + "\n- ".join(missing))
    print("Structural preflight passed; run component and full-path acceptance next.")


if __name__ == "__main__":
    main()
