"""Проверки AI v2 контракта: примеры проходят, нарушения отклоняются, сеть не нужна."""

from __future__ import annotations

import urllib.request

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from tests.contract_v2_support import (
    HTTP_ERROR_ORDER,
    SHARED_DEFS,
    V2,
    assert_example,
    assert_invalid,
    build_registry,
    load_json,
    schema_id,
    schema_path,
)

AI_ID = schema_id("ai")
# Общие определения живут только в common: AI не должен их копировать.
FORBIDDEN_COPIES = (*SHARED_DEFS, "Error", "ErrorBody", "DiagnosticSnapshot", "Uuid", "StableId")
# Разрешённые внешние схемы для $ref из ai.schema.json.
ALLOWED_REF_PREFIXES = (schema_id("common") + "#/", schema_id("public") + "#/", "#/")
# Имя SSE-события -> определение его payload.
SSE_PAYLOADS = {
    "run.started": "RunStartedEvent",
    "message.delta": "MessageDeltaEvent",
    "message.sources": "MessageSourcesEvent",
    "tool.proposed": "ToolProposedEvent",
    "generation.completed": "GenerationCompletedEvent",
    "run.failed": "RunFailedEvent",
}


def ai_schema() -> dict:
    return load_json(schema_path("ai"))


def ai_registry() -> Registry:
    schema = ai_schema()
    return build_registry().with_resources([(AI_ID, Resource.from_contents(schema))])


def walk(node: object, path: str = "$"):
    """Обходит все узлы схемы и отдаёт пары (путь, словарь)."""
    if isinstance(node, dict):
        yield path, node
        for key, value in node.items():
            yield from walk(value, f"{path}/{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from walk(value, f"{path}/{index}")


def test_ai_schema_is_valid_draft_2020_12_with_expected_id():
    schema = ai_schema()
    Draft202012Validator.check_schema(schema)
    assert schema["$id"] == AI_ID


def test_every_ai_definition_has_a_valid_example():
    registry = ai_registry()
    definitions = set(ai_schema()["$defs"])
    seen = set()
    for record in load_json(V2 / "examples" / "ai.json"):
        assert record["schema_uri"] == AI_ID
        assert record["definition"] in definitions, record["definition"]
        assert_example(record, registry)
        seen.add(record["definition"])
    assert sorted(definitions - seen) == []


def test_every_ai_invalid_case_is_rejected_for_the_expected_reason():
    registry = ai_registry()
    records = load_json(V2 / "invalid" / "ai.json")
    assert len(records) >= 20
    case_ids = [record["case_id"] for record in records]
    assert len(case_ids) == len(set(case_ids)), "повторяется case_id"
    for record in records:
        assert record["schema_uri"] == AI_ID
        assert_invalid(record, registry)


def test_every_object_in_ai_schema_is_closed():
    for path, node in walk(ai_schema()):
        if node.get("type") == "object":
            assert node.get("additionalProperties") is False, path


def test_ai_schema_does_not_copy_common_definitions():
    copies = sorted(set(ai_schema()["$defs"]) & set(FORBIDDEN_COPIES))
    assert copies == []


def test_ai_refs_point_only_to_local_schemas():
    for path, node in walk(ai_schema()):
        ref = node.get("$ref")
        if ref is not None:
            assert ref.startswith(ALLOWED_REF_PREFIXES), f"{path}: {ref}"


def test_sse_event_names_match_payload_definitions():
    definitions = ai_schema()["$defs"]
    assert definitions["SseEventType"]["enum"] == list(SSE_PAYLOADS)
    for payload in SSE_PAYLOADS.values():
        assert "run_id" in definitions[payload]["required"]


def test_internal_error_examples_follow_the_check_order():
    codes = [
        record["payload"]["error"]["code"]
        for record in load_json(V2 / "examples" / "ai.json")
        if record["definition"] == "InternalError"
    ]
    assert codes[: len(HTTP_ERROR_ORDER)] == list(HTTP_ERROR_ORDER)
    assert codes[len(HTTP_ERROR_ORDER)] == "FORBIDDEN"


def test_ai_validation_does_not_fetch_schemas(monkeypatch: pytest.MonkeyPatch):
    def refuse(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("валидация AI-схемы полезла в сеть")

    monkeypatch.setattr(urllib.request, "urlopen", refuse)
    registry = ai_registry()
    for record in load_json(V2 / "examples" / "ai.json"):
        assert_example(record, registry)
