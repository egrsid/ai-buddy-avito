"""Run owner-supplied AI ingest/DB tests without a shell or an administrative DSN."""

import argparse
import json
import os
import subprocess
from collections.abc import Mapping

COMMANDS = {"ingest": "AI_INGEST_COMMAND", "db-test": "AI_DB_TEST_COMMAND"}
SCENARIOS = {"normal", "unavailable", "timeout", "slow_stream", "invalid_tool"}


def command_for(task: str, environment: Mapping[str, str]) -> list[str]:
    name = COMMANDS[task]
    try:
        command = json.loads(environment.get(name, ""))
    except json.JSONDecodeError as error:
        raise ValueError(f"{name} must be a JSON argv array supplied by AI Engineer") from error
    if (
        not isinstance(command, list)
        or not command
        or not all(isinstance(arg, str) and arg.strip() for arg in command)
    ):
        raise ValueError(f"{name} must be a nonempty JSON argv array")
    return command


def validate_environment(environment: Mapping[str, str]) -> None:
    if environment.get("PGUSER") != "ai_service":
        raise ValueError("AI tasks require the restricted ai_service runtime role")
    if any(environment.get(key) for key in ("POSTGRES_USER", "POSTGRES_PASSWORD")):
        raise ValueError("Administrative credentials must not enter AI task containers")
    mode = environment.get("LLM_MODE", "mock")
    app_env = environment.get("APP_ENV", "")
    flag = environment.get("MOCK_FAULTS_ENABLED", "false")
    scenario = environment.get("AI_MOCK_SCENARIO", "normal")
    if mode not in {"mock", "live"} or flag not in {"true", "false"}:
        raise ValueError("Invalid AI mode or fault flag")
    if scenario not in SCENARIOS:
        raise ValueError("Unknown AI mock scenario")
    if flag == "true" and (mode != "mock" or app_env not in {"local", "test"}):
        raise ValueError("Mock faults are allowed only in local/test mock mode")
    if scenario != "normal" and flag != "true":
        raise ValueError("A mock scenario requires the explicit fault flag")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task", choices=COMMANDS)
    args = parser.parse_args()
    try:
        validate_environment(os.environ)
        command = command_for(args.task, os.environ)
    except ValueError as error:
        parser.exit(2, f"{error}\n")
    if args.task == "db-test" and os.environ.get("LLM_MODE", "mock") != "mock":
        parser.exit(2, "DB acceptance tests must use mock LLM mode\n")
    # Propagate failures; never treat a missing CLI/test suite as successful bootstrap.
    subprocess.run(command, check=True, timeout=300)


if __name__ == "__main__":
    main()
