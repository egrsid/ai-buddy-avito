package api

import "testing"

func TestSubmissionUsesLinkedCurrentProofAndPinnedBrief(t *testing.T) {
	f := newFixture(t)
	buddy := f.browser("buddy-a")
	intern := f.browser("intern-a")
	other := f.browser("intern-b")
	brief, assignments := buddy.publishedBrief(internA)
	a := assignments[0]
	root := "/api/v4/assignments/" + str(a["id"])
	path := root + "/submission"
	draft := Object{"brief_version": 1, "attempt": 1, "evidence_id": uuid(), "conclusion": "SSL-подключение прошло проверку."}
	intern.call("POST", path, draft, 404)
	buddy.call("POST", root+"/permitted-template", Object{"template_id": "db-access-team-a", "template_version": 1, "expected_revision": a["revision"]}, 200)
	intern.call("POST", path, draft, 409)
	workspace := "/api/v4/workspaces/" + str(a["id"])
	template := Object{"template_id": "db-access-team-a", "template_version": 1}
	preview := intern.call("POST", workspace+"/link-preview", template, 201)
	linked := intern.call("POST", workspace+"/link-confirm", Object{"preview_id": preview["id"], "preview_hash": preview["preview_hash"], "expected_revision": preview["assignment_revision"]}, 200)
	other.call("GET", path, nil, 404)
	intern.call("POST", path, draft, 409)
	f.setGrant(internA, true)
	goalPath := "/goals/" + str(obj(obj(linked["card"])["goal"])["id"])
	intern.check(intern.call("GET", goalPath, nil, 200), "check_access", "", 201)
	intern.check(intern.call("GET", goalPath, nil, 200), "check_connection", "require", 201)
	proof := obj(intern.call("GET", path, nil, 200)["proof"])
	draft["evidence_id"] = proof["id"]
	f.setGrant(internA, false)
	intern.call("POST", path, draft, 409)
	if intern.call("GET", path, nil, 200)["proof"] != nil {
		t.Fatal("revoked access still offers a DB proof")
	}
	f.setGrant(internA, true)
	intern.check(intern.call("GET", goalPath, nil, 200), "check_access", "", 201)
	intern.check(intern.call("GET", goalPath, nil, 200), "check_connection", "require", 201)
	intern.call("POST", path, draft, 409)
	draft["evidence_id"] = obj(intern.call("GET", path, nil, 200)["proof"])["id"]
	receipt := intern.call("POST", path, draft, 201)
	intern.call("POST", path, draft, 409)
	review := Object{"submission_id": receipt["id"], "decision": "returned", "comment": "Уточните режим SSL"}
	intern.call("POST", path+"/review", review, 403)
	buddy.call("POST", path+"/review", review, 200)
	draft["attempt"] = 2
	receipt = intern.call("POST", path, draft, 201)
	review["decision"] = "accepted"
	buddy.call("POST", path+"/review", review, 409)
	review["submission_id"] = receipt["id"]
	buddy.call("POST", path+"/review", review, 200)
	if last := obj(intern.call("GET", path, nil, 200)["latest"]); last["status"] != "accepted" || num(last["attempt"]) != 2 {
		t.Fatal(last)
	}
	briefPath := "/api/v3/task-briefs/" + str(brief["id"])
	current := buddy.call("GET", briefPath, nil, 200)
	changed := buddy.call("POST", briefPath+"/draft", Object{"expected_revision": current["revision"], "content": briefContent("Новое задание", "Описать подключение.")}, 200)
	buddy.call("POST", briefPath+"/publish", Object{"expected_revision": changed["revision"]}, 200)
	assignmentPath := "/api/v3/task-assignments/" + str(a["id"])
	current = intern.call("GET", assignmentPath, nil, 200)
	intern.call("POST", assignmentPath+"/adopt-version", Object{"brief_version": 2, "expected_revision": current["revision"]}, 200)
	if view := intern.call("GET", path, nil, 200); view["latest"] != nil || num(view["brief_version"]) != 2 {
		t.Fatal("old approval transferred to a new version", view)
	}
}
