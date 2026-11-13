"""v3 contracts: valid Draft 2020-12, offline $ref to v2 common, positive and negative samples."""

import json
import urllib.request
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://ai-buddy.invalid/contracts"
UUID = "10000000-0000-4000-8000-000000000003"
HASH = "a" * 64
STAMP = "2026-11-13T10:00:00Z"


def registry() -> Registry:
    resources = []
    for folder in ("v2", "v3"):
        for path in sorted((ROOT / "contracts" / folder).glob("*.schema.json")):
            contents = json.loads(path.read_text(encoding="utf-8"))
            resources.append((contents["$id"], Resource.from_contents(contents)))
    return Registry().with_resources(resources)


def validator(name: str, definition: str) -> Draft202012Validator:
    schema = {"$ref": f"{BASE}/v3/{name}.schema.json#/$defs/{definition}"}
    return Draft202012Validator(schema, registry=registry(), format_checker=FormatChecker())


CONTENT = {
    "title": "ТЗ",
    "goal": "Цель",
    "sections": [{"id": "deadline", "title": "Срок", "text": "До пятницы"}],
    "expected_result": "Отчёт",
    "acceptance_criteria": [{"id": "steps", "text": "Шаги перечислены"}],
    "refs": [{"document_id": UUID, "version": 1}],
}
VERSION = {
    "brief_id": UUID,
    "version": 1,
    "state": "published",
    "content": CONTENT,
    "content_hash": HASH,
    "created_at": STAMP,
    "published_at": STAMP,
}
ORIGIN = {"mode": "live", "answered_by": "secondary", "completion": "complete"}
METRICS = {"affected_interns": 2, "observations": 3, "open_items": 1, "suppressed": False}
HIDDEN = {"affected_interns": None, "observations": None, "open_items": None, "suppressed": True}

VALID = [
    ("public", "MentorContact", {"status": "missing"}),
    (
        "public",
        "MentorContact",
        {
            "status": "available",
            "display_name": "buddy-a",
            "telegram_url": "https://t.me/ai_buddy_demo_mentor_a",
            "contact_revision": 1,
        },
    ),
    ("public", "ContactPreviewRequest", {"goal_id": UUID, "step_id": "check_access"}),
    ("public", "ContactPreviewRequest", {"assignment_id": UUID, "section_id": "goal"}),
    (
        "public",
        "ContactExportRequest",
        {"preview_id": UUID, "content_hash": HASH, "contact_revision": 1},
    ),
    ("public", "TaskBriefCreateRequest", {"content": CONTENT}),
    ("public", "TaskBriefVersion", VERSION),
    (
        "public",
        "TaskBrief",
        {
            "id": UUID,
            "title": "ТЗ",
            "state": "published",
            "latest_published_version": VERSION,
            "draft": None,
            "versions": [{"version": 1, "state": "published", "published_at": STAMP}],
            "assignment_count": 2,
            "open_report_count": 0,
            "revision": 3,
            "created_at": STAMP,
            "updated_at": STAMP,
        },
    ),
    ("public", "FrictionCreateRequest", {"section_id": "deadline", "reason": "outcome_unclear"}),
    (
        "public",
        "TaskClarityReviewRequest",
        {"decision": "resolved", "reason": "v2", "expected_version": 3, "resolved_version": 2},
    ),
    ("public", "GoalSummaryList", {"items": [], "next_cursor": None}),
    (
        "public",
        "Statistics",
        {
            "view": "mentor",
            "source_kind": "technical",
            "as_of": STAMP,
            "timezone": "Europe/Moscow",
            "window": {"from": STAMP, "to": STAMP, "days": 30},
            "privacy_threshold": 2,
            "summary": METRICS,
            "rows": [
                {
                    "key": {"journey_id": "db-access-team-a", "step_id": "check_connection"},
                    "label": "Проверить подключение · DB_SSL_REQUIRED",
                    "metrics": HIDDEN,
                    "related_reports": [],
                }
            ],
            "daily": [
                {
                    "date": "2026-11-13",
                    "affected_interns": 2,
                    "observations": 3,
                    "suppressed": False,
                }
            ],
            "next_cursor": None,
        },
    ),
    ("public", "MessageOriginData", {"run_id": UUID, "message_id": UUID, "origin": ORIGIN}),
    ("ai", "ResponseOriginEvent", {"run_id": UUID, "origin": ORIGIN}),
    (
        "ai",
        "TaskClarityDraftRequest",
        {
            "brief_title": "ТЗ",
            "brief_version": 1,
            "section": {"id": "deadline", "title": "Срок", "text": "До пятницы"},
            "reason": "outcome_unclear",
            "affected_count": 2,
        },
    ),
    (
        "events",
        "TaskEvent",
        {
            "id": UUID,
            "type": "task_friction_reported",
            "schema_version": 1,
            "occurred_at": STAMP,
            "source": "go_task_workflow",
            "entity": {"type": "task_assignment", "id": UUID},
            "correlation_id": UUID,
            "payload": {
                "assignment_id": UUID,
                "section_id": "deadline",
                "reason": "outcome_unclear",
            },
            "synthetic": True,
        },
    ),
]

INVALID = [
    # Telegram link only to t.me and one username, never another host or a query.
    (
        "public",
        "MentorContact",
        {"status": "available", "display_name": "x", "contact_revision": 1},
    ),
    (
        "public",
        "MentorContact",
        {
            "status": "available",
            "display_name": "x",
            "telegram_url": "https://evil.example/ai_buddy",
            "contact_revision": 1,
        },
    ),
    (
        "public",
        "MentorContact",
        {"status": "missing", "telegram_url": "https://t.me/ai_buddy_demo_mentor_a"},
    ),
    # Exactly one context: own goal step or own assignment.
    ("public", "ContactPreviewRequest", {"goal_id": UUID, "step_id": "x", "assignment_id": UUID}),
    ("public", "ContactPreviewRequest", {"question": "Привет"}),
    # Client cannot send roles, owners, counts or verification.
    ("public", "TaskBriefCreateRequest", {"content": CONTENT, "owner_id": UUID}),
    ("public", "TaskBriefCreateRequest", {"content": {**CONTENT, "sections": []}}),
    ("public", "FrictionCreateRequest", {"section_id": "x", "reason": "too_hard"}),
    (
        "public",
        "FrictionCreateRequest",
        {"section_id": "x", "reason": "outcome_unclear", "count": 2},
    ),
    ("public", "TaskBriefVersion", {**VERSION, "state": "draft"}),
    (
        "public",
        "TaskClarityReviewRequest",
        {"decision": "resolved", "reason": "x", "expected_version": 1},
    ),
    (
        "public",
        "TaskClarityReviewRequest",
        {"decision": "accepted", "reason": "x", "expected_version": 1, "resolved_version": 2},
    ),
    (
        "public",
        "MessageOriginData",
        {"run_id": UUID, "message_id": UUID, "origin": {"mode": "live"}},
    ),
    ("ai", "ResponseOriginEvent", {"run_id": UUID, "origin": {**ORIGIN, "answered_by": "unknown"}}),
    (
        "events",
        "TaskEvent",
        {
            "id": UUID,
            "type": "task_friction_reported",
            "schema_version": 1,
            "occurred_at": STAMP,
            "source": "go_task_workflow",
            "entity": {"type": "task_assignment", "id": UUID},
            "correlation_id": UUID,
            "payload": {"intern_id": UUID},
            "synthetic": True,
        },
    ),
]


def test_v3_schemas_are_valid_draft_2020_12_with_stable_ids():
    for path in sorted((ROOT / "contracts" / "v3").glob("*.schema.json")):
        schema = json.loads(path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        assert schema["$id"] == f"{BASE}/v3/{path.name}"


@pytest.mark.parametrize("name,definition,payload", VALID)
def test_v3_positive_samples(name, definition, payload):
    errors = list(validator(name, definition).iter_errors(payload))
    assert not errors, [e.message for e in errors]


@pytest.mark.parametrize("name,definition,payload", INVALID)
def test_v3_negative_samples(name, definition, payload):
    assert not validator(name, definition).is_valid(payload)


def test_v3_validation_does_not_fetch_schemas(monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("v3 schema validation tried to use the network")

    monkeypatch.setattr(urllib.request, "urlopen", refuse)
    for name, definition, payload in VALID:
        validator(name, definition).validate(payload)
