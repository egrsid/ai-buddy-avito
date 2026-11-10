"""Apply coverage from the first business module; bootstrap wiring is explicitly reported."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

from scripts.go_coverage import line_coverage

ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str], directory: Path) -> None:
    subprocess.run(command, cwd=directory, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("component", choices=["backend", "ai", "mock", "frontend"])
    component = parser.parse_args().component
    if component == "backend":
        directory = ROOT / "backend"
        run(["go", "vet", "./..."], directory)
        run(["go", "build", "-o", os.devnull, "./..."], directory)
        if not list((directory / "internal").rglob("*.go")):
            print("BOOTSTRAP backend: compilation only; business coverage not available.")
            return
        run(
            [
                "go",
                "test",
                "-race",
                "-coverpkg=./internal/...",
                "-coverprofile=coverage.coverprofile",
                "./...",
            ],
            directory,
        )
        report = subprocess.check_output(
            ["go", "tool", "cover", "-func=coverage.coverprofile"], cwd=directory, text=True
        )
        print(report)
        covered, total = line_coverage((directory / "coverage.coverprofile").read_text())
        print(f"Go line coverage: {covered}/{total}")
        if total == 0 or covered * 100 <= total * 80:
            raise SystemExit("Go line coverage must be strictly >80%")
    elif component in {"ai", "mock"}:
        folder, module = (
            ("ai-service", "app") if component == "ai" else ("mock-services", "corporate")
        )
        source = ROOT / folder / module
        business = [p for p in source.rglob("*.py") if p.name not in {"main.py", "__init__.py"}]
        if not business:
            run([sys.executable, "-m", "compileall", "-q", str(source)], ROOT)
            print(f"BOOTSTRAP {component}: wiring only; business coverage not available.")
            return
        # Preserve project imports for independent service test execution.
        os.environ["PYTHONPATH"] = str(ROOT / folder)
        run(
            [
                sys.executable,
                "-m",
                "pytest",
                f"{folder}/tests",
                f"--cov={module}",
                "--cov-fail-under=80.01",
                "--cov-report=term-missing",
                f"--cov-report=xml:{folder}/coverage/coverage.xml",
            ],
            ROOT,
        )
    else:
        directory = ROOT / "frontend"
        run(["npm", "run", "build"], directory)
        business = [
            p
            for p in (directory / "src").rglob("*")
            if p.suffix in {".ts", ".tsx"} and p.name != "main.tsx" and not p.name.endswith(".d.ts")
        ]
        if not business:
            print("BOOTSTRAP frontend: static entry screen only; business coverage not available.")
            return
        run(["npm", "run", "test:coverage"], directory)


if __name__ == "__main__":
    main()
