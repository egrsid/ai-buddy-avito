"""Validate local documentation links, shared examples and seed integrity without network."""

import json
import re
from pathlib import Path
from uuid import UUID

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from pglast import parse_sql

ROOT = Path(__file__).resolve().parents[1]


def validator(name: str) -> Draft202012Validator:
    schema = json.loads((ROOT / "contracts/v1.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(
        {"$ref": f"#/$defs/{name}", "$defs": schema["$defs"]},
        format_checker=FormatChecker(),
    )


def check_links(root: Path = ROOT) -> list[str]:
    errors = []
    files = [root / "README.md", root / "ARCHITECTURE.md", *root.glob("docs/**/*.md")]
    for path in files:
        if not path.exists():
            errors.append(f"Missing document: {path.relative_to(root)}")
            continue
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", path.read_text()):
            target = target.split("#", 1)[0]
            if not target or re.match(r"^[a-zA-Z]+:", target):
                continue
            if not (path.parent / target).exists():
                errors.append(f"Broken link {path.relative_to(root)}: {target}")
    return errors


def check_seed() -> None:
    data = json.loads((ROOT / "data/seed/demo.json").read_text())
    users = {item["id"]: item for item in data["users"]}
    docs = {item["id"]: item for item in data["documents"]}
    assert len(users) == len(data["users"]), "Duplicate user ID"
    assert len(docs) == len(data["documents"]), "Duplicate knowledge ID"
    assert len({u["account_id"] for u in users.values()}) == len(users)
    tasks = data["tasks"]
    assert len({t["id"] for t in tasks}) == len(tasks), "Duplicate task ID"
    assert len({(t["intern_id"], t["position"]) for t in tasks}) == len(tasks)
    for user in users.values():
        UUID(user["id"])
        if user["role"] == "intern":
            assert users[user["buddy_id"]]["role"] == "buddy"
        else:
            assert user["role"] == "buddy" and user["buddy_id"] is None
    for task in tasks:
        UUID(task["id"])
        assert users[task["intern_id"]]["role"] == "intern"
        assert task["status"] in {"todo", "in_progress", "blocked", "done"}
        assert set(task["source_ids"]) <= docs.keys()
    for doc in docs.values():
        UUID(doc["id"])
        assert doc["synthetic"] is True and doc["visibility"] == "demo_public"
        assert "Синтетический" in (ROOT / doc["path"]).read_text()
    for case in json.loads((ROOT / "data/knowledge/evals.json").read_text()):
        assert set(case.get("expected_source_ids", [])) <= docs.keys()


def main() -> None:
    errors = check_links()
    assert not errors, "\n".join(errors)
    for example in json.loads((ROOT / "contracts/examples.json").read_text()):
        validator(example["schema"]).validate(example["payload"])
    check_seed()
    migrations = [
        *ROOT.glob("backend/migrations/*.sql"),
        *ROOT.glob("ai-service/migrations/*.sql"),
        *ROOT.glob("mock-services/migrations/*.sql"),
    ]
    for path in migrations:
        parse_sql(path.read_text())
    compose = yaml.safe_load((ROOT / "compose.yaml").read_text())
    assert set(compose["services"]) == {
        "postgres",
        "migrate",
        "seed",
        "backend",
        "ai-service",
        "mock-services",
        "frontend",
    }
    print("Docs, JSON Schema examples, seed, SQL syntax and Compose YAML: OK")


if __name__ == "__main__":
    main()
