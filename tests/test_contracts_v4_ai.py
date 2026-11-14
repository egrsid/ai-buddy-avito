"""V4-CONTRACT-AI-01: contracts/v4/ai.schema.json — valid Draft 2020-12, offline $ref, samples."""

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "contracts" / "v4" / "ai.schema.json"
BASE = "https://ai-buddy.invalid/contracts/v4/ai.schema.json"
DOC = "11111111-1111-4111-8111-111111111111"
HASH = "a" * 64


def registry() -> Registry:
    resources = []
    for folder in ("v2", "v3", "v4"):
        for path in sorted((ROOT / "contracts" / folder).glob("*.schema.json")):
            contents = json.loads(path.read_text(encoding="utf-8"))
            resources.append((contents["$id"], Resource.from_contents(contents)))
    return Registry().with_resources(resources)


def errors(definition: str, value) -> list:
    schema = {"$ref": f"{BASE}#/$defs/{definition}"}
    validator = Draft202012Validator(schema, registry=registry(), format_checker=FormatChecker())
    return list(validator.iter_errors(value))


REQUEST = {
    "brief_title": "ТЗ: отчёт о подключении",
    "base_version": 1,
    "base_hash": HASH,
    "report": {
        "section_id": "report",
        "reason": "outcome_unclear",
        "affected_count": 2,
        "hypothesis": "Наблюдение: 2 разных стажёра.",
    },
    "fields": [
        {"path": "sections/report/text", "label": "Отчёт", "text": "Опишите.", "hash": HASH},
        {"path": "acceptance_criteria/ok/text", "label": "Критерий", "text": "Ок.", "hash": HASH},
        {"path": "goal", "label": "Цель", "text": "Цель.", "hash": HASH},
        {"path": "expected_result", "label": "Результат", "text": "Отчёт.", "hash": HASH},
    ],
    "refs": [{"document_id": DOC, "version": 1, "title": "Инструкция"}],
    "answers": [{"question": "Где сдавать?", "answer": "Через PR."}],
}
CHANGE = {
    "id": "c1",
    "path": "sections/report/text",
    "label": "Уточнить формат",
    "old_hash": HASH,
    "replacement": "Опишите шаги списком.",
    "rationale": "Формат был свободным.",
}
QUESTION = {"id": "q1", "text": "Где сдавать?", "path": "sections/report/text"}
RESPONSE = {
    "outcome": "ready",
    "base_version": 1,
    "base_hash": HASH,
    "changes": [CHANGE],
    "questions": [QUESTION],
    "rationale": "Формат уточнён.",
    "evidence_refs": [{"document_id": DOC, "version": 1}],
    "origin": {"mode": "live", "answered_by": "primary"},
}


def patched(value: dict, **changes) -> dict:
    result = copy.deepcopy(value)
    result.update(changes)
    return result


def test_schema_is_valid_draft_2020_12_with_id():
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    assert schema["$id"] == BASE


@pytest.mark.parametrize(
    ("definition", "value"),
    [
        ("RevisionDraftRequest", REQUEST),
        ("RevisionDraftRequest", patched(REQUEST, refs=[], answers=[])),
        ("RevisionDraftResponse", RESPONSE),
        (
            "RevisionDraftResponse",
            patched(
                RESPONSE,
                outcome="needs_input",
                changes=[],
                origin={"mode": "live", "answered_by": "offline", "reason_code": "invalid_output"},
            ),
        ),
        (
            "RevisionDraftResponse",
            patched(
                RESPONSE,
                outcome="no_change",
                changes=[],
                questions=[],
                evidence_refs=[],
                origin={"mode": "mock", "answered_by": "offline", "reason_code": "config_mock"},
            ),
        ),
        (
            "RevisionDraftResponse",
            patched(RESPONSE, origin={"mode": "live", "answered_by": "secondary"}),
        ),
    ],
)
def test_valid_samples(definition, value):
    assert errors(definition, value) == []


BAD_FIELD = dict(REQUEST["fields"][0])


@pytest.mark.parametrize(
    ("definition", "value"),
    [
        # Только разрешённые пути полей: без заголовков, произвольных JSON Patch и обходов.
        (
            "RevisionDraftRequest",
            patched(REQUEST, fields=[{**BAD_FIELD, "path": "sections/report/title"}]),
        ),
        ("RevisionDraftRequest", patched(REQUEST, fields=[{**BAD_FIELD, "path": "/goal"}])),
        (
            "RevisionDraftRequest",
            patched(REQUEST, fields=[{**BAD_FIELD, "path": "sections/../text"}]),
        ),
        ("RevisionDraftRequest", patched(REQUEST, fields=[{**BAD_FIELD, "path": "permissions"}])),
        ("RevisionDraftRequest", patched(REQUEST, fields=[])),
        ("RevisionDraftRequest", patched(REQUEST, fields=[BAD_FIELD] * 7)),
        ("RevisionDraftRequest", patched(REQUEST, fields=[{**BAD_FIELD, "text": "x" * 4001}])),
        ("RevisionDraftRequest", patched(REQUEST, fields=[{**BAD_FIELD, "hash": "ABC"}])),
        ("RevisionDraftRequest", patched(REQUEST, refs=REQUEST["refs"] * 6)),
        ("RevisionDraftRequest", patched(REQUEST, intern_id=DOC)),
        (
            "RevisionDraftRequest",
            patched(REQUEST, report={**REQUEST["report"], "affected_count": 1}),
        ),
        (
            "RevisionDraftRequest",
            patched(REQUEST, report={**REQUEST["report"], "intern_ids": [DOC]}),
        ),
        ("RevisionDraftRequest", patched(REQUEST, report={**REQUEST["report"], "reason": "other"})),
        ("RevisionDraftRequest", {k: v for k, v in REQUEST.items() if k != "base_hash"}),
        # Ответ: согласованность outcome, ограничения, происхождение.
        ("RevisionDraftResponse", patched(RESPONSE, changes=[])),
        (
            "RevisionDraftResponse",
            patched(RESPONSE, outcome="needs_input", changes=[], questions=[]),
        ),
        ("RevisionDraftResponse", patched(RESPONSE, outcome="no_change")),
        ("RevisionDraftResponse", patched(RESPONSE, outcome="applied")),
        ("RevisionDraftResponse", patched(RESPONSE, changes=[CHANGE] * 11)),
        (
            "RevisionDraftResponse",
            patched(RESPONSE, changes=[{**CHANGE, "replacement": "x" * 4001}]),
        ),
        ("RevisionDraftResponse", patched(RESPONSE, changes=[{**CHANGE, "path": "journey"}])),
        ("RevisionDraftResponse", patched(RESPONSE, changes=[{**CHANGE, "verified": True}])),
        ("RevisionDraftResponse", patched(RESPONSE, questions=[{**QUESTION, "text": "x" * 501}])),
        ("RevisionDraftResponse", patched(RESPONSE, evidence_refs=[{"document_id": DOC}])),
        (
            "RevisionDraftResponse",
            patched(RESPONSE, origin={"mode": "mock", "answered_by": "primary"}),
        ),
        (
            "RevisionDraftResponse",
            patched(RESPONSE, origin={"mode": "live", "answered_by": "offline"}),
        ),
        (
            "RevisionDraftResponse",
            patched(
                RESPONSE,
                origin={"mode": "live", "answered_by": "primary", "reason_code": "timeout"},
            ),
        ),
        ("RevisionDraftResponse", patched(RESPONSE, published=True)),
    ],
)
def test_invalid_samples(definition, value):
    assert errors(definition, value) != []


def test_no_network_refs():
    text = SCHEMA.read_text(encoding="utf-8")
    refs = [part.split('"')[0] for part in text.split('"$ref": "')[1:]]
    assert refs and all(ref.startswith(("#/", "https://ai-buddy.invalid/")) for ref in refs)
