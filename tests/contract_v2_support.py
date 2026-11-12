"""Offline Draft 2020-12 registry for the Backend v2 contracts.

Refs resolve only through the local schema files. This module does not open a network
connection and does not fetch ``$id`` URLs.
"""

from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
V2 = ROOT / "contracts" / "v2"
SCHEMA_NAMES = ("common", "public", "journey", "events", "corporate")
EXAMPLE_KEYS = frozenset({"schema_uri", "definition", "payload"})
INVALID_KEYS = EXAMPLE_KEYS | {"case_id", "expected_error_keyword"}
SHARED_DEFS = ("AccessScope", "Source", "State", "ErrorCode")
HTTP_ERROR_ORDER = (
    "UNAUTHENTICATED",
    "INVALID_REQUEST_ID",
    "INVALID_JSON",
    "VALIDATION_ERROR",
)


def schema_id(name: str) -> str:
    return f"https://ai-buddy.invalid/contracts/v2/{name}.schema.json"


def schema_path(name: str) -> Path:
    return V2 / f"{name}.schema.json"


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def build_registry() -> Registry:
    resources: list[tuple[str, Resource]] = []
    for name in SCHEMA_NAMES:
        contents = load_json(schema_path(name))
        if not isinstance(contents, dict):
            raise AssertionError(f"{name} schema must be an object")
        Draft202012Validator.check_schema(contents)
        if contents.get("$id") != schema_id(name):
            raise AssertionError(f"{name} $id drifted from {schema_id(name)}")
        resources.append((contents["$id"], Resource.from_contents(contents)))
    return Registry().with_resources(resources)


def validator_for(
    schema_uri: str,
    definition: str,
    registry: Registry | None = None,
) -> Draft202012Validator:
    return Draft202012Validator(
        {"$ref": f"{schema_uri}#/$defs/{definition}"},
        registry=build_registry() if registry is None else registry,
        format_checker=FormatChecker(),
    )


def iter_records(name: str) -> list[dict]:
    path = V2 / "examples" / f"{name}.json"
    records = load_json(path)
    if not isinstance(records, list):
        raise AssertionError(f"{name} examples must be a list")
    return records


def error_blob(error: ValidationError) -> str:
    parts = [error.message, str(error.validator or "")]
    for child in error.context:
        parts.append(error_blob(child))
    return "\n".join(parts)


def assert_example(record: dict, registry: Registry) -> None:
    if set(record) != EXAMPLE_KEYS:
        raise AssertionError(f"example keys {sorted(record)}")
    validator_for(record["schema_uri"], record["definition"], registry).validate(record["payload"])


def assert_invalid(record: dict, registry: Registry) -> None:
    if set(record) != INVALID_KEYS:
        raise AssertionError(f"invalid keys {sorted(record)}")
    case_id = record["case_id"]
    keyword = record["expected_error_keyword"]
    if not case_id or not keyword:
        raise AssertionError("case_id and expected_error_keyword are required")
    try:
        compiled = validator_for(record["schema_uri"], record["definition"], registry)
        compiled.validate(record["payload"])
    except ValidationError as error:
        blob = error_blob(error)
        if keyword not in blob:
            raise AssertionError(f"{case_id} missing {keyword!r} in {blob}") from error
        return
    raise AssertionError(f"{case_id} was accepted")


def check_http_fixture_order(records: list[dict]) -> None:
    codes = [
        record["payload"]["error"]["code"] for record in records if record["definition"] == "Error"
    ]
    if codes[:4] != list(HTTP_ERROR_ORDER):
        raise AssertionError(f"HTTP fixture order is {codes[:4]}")


def check_shared_definitions() -> None:
    for definition in SHARED_DEFS:
        owners = [
            name
            for name in SCHEMA_NAMES
            if definition in load_json(schema_path(name)).get("$defs", {})
        ]
        if owners != ["common"]:
            raise AssertionError(f"{definition} defined in {owners}")
        ai_schema = V2 / "ai.schema.json"
        if ai_schema.exists() and definition in load_json(ai_schema).get("$defs", {}):
            raise AssertionError(f"AI schema redefined {definition}")


def check_event_types(records: list[dict]) -> None:
    declared = load_json(schema_path("common"))["$defs"]["EventType"]["enum"]
    found = [
        record["payload"]["type"] for record in records if record["definition"] == "BusinessEvent"
    ]
    if found != declared:
        raise AssertionError(f"event examples {found} != {declared}")


def check_backend_contracts() -> None:
    registry = build_registry()
    for name in SCHEMA_NAMES:
        contents = load_json(schema_path(name))
        definitions = set(contents["$defs"])
        records = iter_records(name)
        seen: set[str] = set()
        for record in records:
            assert_example(record, registry)
            if record["definition"] not in definitions:
                raise AssertionError(f"{name} unknown definition {record['definition']}")
            if record["schema_uri"] != schema_id(name):
                raise AssertionError(f"{name} example points at {record['schema_uri']}")
            seen.add(record["definition"])
        missing = sorted(definitions - seen)
        if missing:
            raise AssertionError(f"{name} has no example for {missing}")
        if name == "common":
            check_http_fixture_order(records)
        if name == "events":
            check_event_types(records)
    invalid = load_json(V2 / "invalid" / "backend.json")
    if not isinstance(invalid, list) or not invalid:
        raise AssertionError("backend invalid cases must be a non-empty list")
    case_ids = [record["case_id"] for record in invalid]
    if len(case_ids) != len(set(case_ids)):
        raise AssertionError("duplicate invalid case_id")
    for record in invalid:
        assert_invalid(record, registry)
    check_shared_definitions()
    error_codes = load_json(schema_path("common"))["$defs"]["ErrorCode"]["enum"]
    if "INVALID_REQUEST_ID" not in error_codes:
        raise AssertionError("ErrorCode is missing INVALID_REQUEST_ID")
