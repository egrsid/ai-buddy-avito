"""The v2 seed is explicit, contract-valid and uses the agreed synthetic identities."""

import hashlib
import json

from tests.contract_v2_support import ROOT, schema_id, validator_for


def test_template_and_seed_match():
    data = json.loads((ROOT / "data/seed/demo-v2.json").read_text())
    journey = json.loads((ROOT / "data/seed/journey-db-v2.json").read_text())
    validator_for(schema_id("journey"), "JourneyTemplate").validate(journey)
    content = dict(journey)
    expected = content.pop("content_hash")
    actual = hashlib.sha256(
        json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    assert expected == actual
    users = {u["account_id"]: u for u in data["users"]}
    assert len(users) == 7
    assert users["intern-a"]["team"] == users["intern-b"]["team"] == "team-a"
    assert users["intern-c"]["team"] == "team-b"
    assert users["intern-a"]["buddy_id"] == users["intern-b"]["buddy_id"]
    assert journey["approved_by"] == users["approver-a"]["id"]
    docs = {(d["id"], d["version"]) for d in data["documents"]}
    for step in journey["steps"]:
        ref = step["instruction_reference"]
        assert (ref["document_id"], ref["version"]) in docs
    assert [s["id"] for s in journey["steps"]] == [
        "select_resource",
        "check_access",
        "check_connection",
    ]
