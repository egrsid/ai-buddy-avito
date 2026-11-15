"""Read-only v4 artifact inventory. Never claims runtime, review, or live acceptance.

Exit 2 means dependencies are missing/invalid, 0 means artifacts are present, NOT approved.
Does not read env/provider payloads, invoke a paid model, change refs, or touch a database.
"""

import argparse
import hashlib
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    "contracts/v4/public.schema.json",
    "contracts/v4/ai.schema.json",
    "contracts/v4/events.schema.json",
)


def inventory(root: Path) -> dict:
    schemas = {}
    missing, invalid = [], []
    for name in REQUIRED:
        path = root / name
        if not path.is_file():
            missing.append(name)
            continue
        raw = path.read_bytes()
        try:
            schema = json.loads(raw)
            if not isinstance(schema, dict) or not schema.get("$id"):
                raise ValueError("Schema ID required")
            Draft202012Validator.check_schema(schema)
        except (ValueError, SchemaError):
            # No payload or exception detail in the manifest (schemas may contain examples).
            invalid.append(name)
            continue
        schemas[name] = hashlib.sha256(raw).hexdigest()
    return {
        "artifact_status": "blocked" if missing or invalid else "present_not_accepted",
        "missing": missing,
        "invalid": invalid,
        "schema_sha256": schemas,
        "consumer_approval": "open",
        "runtime_acceptance": "open",
        "live_acceptance": "open",
    }


def manifest(root: Path) -> dict:
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=root))
    return {
        "kind": "v4_artifact_inventory",
        "observed_at": datetime.now(UTC).isoformat(),
        "code_revision": revision,
        "tree_dirty": dirty,
        "dataset_revision": None,
        "clock_source": "operator_wall_clock",
        "provider_calls_executed": False,
        "outcomes": inventory(root),
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    result = manifest(ROOT)
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    print(output, end="")
    return 2 if result["outcomes"]["artifact_status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
