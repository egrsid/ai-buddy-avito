"""Guard shared trust boundaries: unknown fields, tool types and required confirmation inputs."""

import copy
import json

import pytest
from jsonschema import ValidationError

from scripts.check_repo import ROOT, check_links, check_seed, validator


def test_shared_examples_and_seed_are_consistent():
    for example in json.loads((ROOT / "contracts/examples.json").read_text()):
        validator(example["schema"]).validate(example["payload"])
    check_seed()
    assert check_links() == []


@pytest.mark.parametrize("field", ["user_id", "buddy_id", "status", "confirmed"])
def test_browser_cannot_inject_authority_into_action(field):
    sample = next(
        x["payload"]
        for x in json.loads((ROOT / "contracts/examples.json").read_text())
        if x["schema"] == "Action"
    )
    draft = {
        k: copy.deepcopy(sample[k]) for k in ("conversation_id", "task_id", "type", "parameters")
    }
    draft[field] = "injected"
    with pytest.raises(ValidationError):
        validator("ActionDraft").validate(draft)


@pytest.mark.parametrize(
    "payload",
    [
        {"content": "question", "retry_of": "30000000-0000-4000-8000-000000000001"},
        {"content": ""},
        {"retry_of": "not-a-uuid"},
        {"content": "a" * 4001},
    ],
)
def test_ambiguous_or_invalid_run_is_rejected(payload):
    with pytest.raises(ValidationError):
        validator("RunRequest").validate(payload)


def test_task_tool_requires_task_context():
    with pytest.raises(ValidationError):
        validator("ActionDraft").validate(
            {
                "conversation_id": "50000000-0000-4000-8000-000000000001",
                "task_id": None,
                "type": "update_task_status",
                "parameters": {"status": "done", "version": 1},
            }
        )


def test_unsupported_tool_and_resource_are_rejected():
    draft = {
        "conversation_id": "50000000-0000-4000-8000-000000000001",
        "task_id": None,
        "type": "grant_admin",
        "parameters": {},
    }
    with pytest.raises(ValidationError):
        validator("ActionDraft").validate(draft)
    draft.update(
        type="create_access_request",
        parameters={
            "resource": "real/production",
            "access_level": "write",
            "reason": "test",
        },
    )
    with pytest.raises(ValidationError):
        validator("ActionDraft").validate(draft)
