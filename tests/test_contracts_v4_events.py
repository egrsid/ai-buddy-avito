"""Executable Go workflow events: closed envelope and text-free, kind-specific payloads."""

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://ai-buddy.invalid/contracts/v4/events.schema.json"
ID = "11111111-1111-4111-8111-111111111111"


def validator():
    resources = []
    for path in (ROOT / "contracts").glob("v*/*.schema.json"):
        value = json.loads(path.read_text())
        resources.append((value["$id"], Resource.from_contents(value)))
    return Draft202012Validator(
        {"$ref": BASE + "#/$defs/WorkflowEvent"},
        registry=Registry().with_resources(resources),
        format_checker=FormatChecker(),
    )


EVENT = {
    "id": ID,
    "type": "workspace_linked",
    "schema_version": 1,
    "occurred_at": "2026-11-14T12:00:00Z",
    "received_at": "2026-11-14T12:00:01Z",
    "source": "go_v4",
    "entity": {"type": "goal", "id": ID},
    "correlation_id": ID,
    "synthetic": True,
    "payload": {
        "assignment_id": ID,
        "goal_id": ID,
        "template_id": "db-access-team-a",
        "template_version": 1,
    },
}


def test_workflow_event_is_closed_and_received_separately():
    assert not list(validator().iter_errors(EVENT))
    for patch in (
        {"source": "browser"},
        {"synthetic": False},
        {"type": "unknown"},
        {"raw_chat": "x"},
    ):
        assert list(validator().iter_errors({**EVENT, **patch}))


@pytest.mark.parametrize(
    "field", ["raw_chat", "intern_name", "api_key", "sql", "before", "replacement"]
)
def test_workflow_payload_never_accepts_text_or_identity(field):
    value = copy.deepcopy(EVENT)
    value["payload"][field] = "not permitted"
    assert list(validator().iter_errors(value))


def test_event_kind_requires_its_own_payload():
    assert list(validator().iter_errors({**EVENT, "type": "proposal_applied"}))
    value = {
        **EVENT,
        "type": "proposal_applied",
        "entity": {"type": "revision_proposal", "id": ID},
        "payload": {"brief_id": ID, "draft_version": 2, "preview_hash": "a" * 64},
    }
    assert not list(validator().iter_errors(value))
