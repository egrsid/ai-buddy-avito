package api

import (
	"strings"
	"testing"
	"time"
)

func TestV4WorkspaceTimelineAndRevision(t *testing.T) {
	f := newFixture(t)
	buddy := f.browser("buddy-a")
	intern := f.browser("intern-a")
	other := f.browser("intern-b")
	brief, assignments := buddy.publishedBrief(internA)
	assignmentID := str(assignments[0]["id"])
	if f.count("SELECT count(*) FROM app.version_exposure_episodes WHERE assignment_id=$1", assignmentID) != 1 {
		t.Fatal("assignment did not open an exposure episode")
	}

	intern.call("GET", "/api/v4/workspaces", nil, 200)
	buddy.call("GET", "/api/v4/workspaces", nil, 403)
	other.call("GET", "/api/v4/workspaces/"+assignmentID, nil, 404)
	buddy.call("POST", "/api/v4/assignments/"+assignmentID+"/permitted-template", Object{"template_id": "db-access-team-a", "template_version": 1, "expected_revision": 1}, 200)
	buddy.call("POST", "/api/v4/assignments/"+assignmentID+"/permitted-template", Object{"template_id": "db-access-team-a", "template_version": 1, "expected_revision": 1}, 409)

	preview := intern.call("POST", "/api/v4/workspaces/"+assignmentID+"/link-preview", Object{"template_id": "db-access-team-a", "template_version": 1}, 201)
	other.call("POST", "/api/v4/workspaces/"+assignmentID+"/link-preview", Object{"template_id": "db-access-team-a", "template_version": 1}, 404)
	intern.call("POST", "/api/v4/workspaces/"+assignmentID+"/link-confirm", Object{"preview_id": preview["id"], "preview_hash": strings.Repeat("a", 64), "expected_revision": preview["assignment_revision"]}, 409)
	linked := intern.call("POST", "/api/v4/workspaces/"+assignmentID+"/link-confirm", Object{"preview_id": preview["id"], "preview_hash": preview["preview_hash"], "expected_revision": preview["assignment_revision"]}, 200)
	if linked["link_status"] != "linked" {
		t.Fatal(linked)
	}
	if f.count("SELECT count(*) FROM app.goals WHERE intern_id=$1 AND journey_id='db-access-team-a'", internA) != 1 {
		t.Fatal("link created a duplicate journey")
	}
	intern.call("POST", "/api/v4/workspaces/"+assignmentID+"/link-confirm", Object{"preview_id": preview["id"], "preview_hash": preview["preview_hash"], "expected_revision": preview["assignment_revision"]}, 409)

	goalID := str(obj(obj(linked["card"])["goal"])["id"])
	before := f.count("SELECT count(*) FROM app.business_events")
	timeline := intern.call("GET", "/api/v4/goals/"+goalID+"/evidence-timeline", nil, 200)
	if timeline["goal_id"] != goalID || f.count("SELECT count(*) FROM app.business_events") != before {
		t.Fatal("timeline changed stored events", timeline)
	}
	other.call("GET", "/api/v4/goals/"+goalID+"/evidence-timeline", nil, 404)
	buddy.call("GET", "/api/v4/goals/"+goalID+"/evidence-timeline", nil, 403)
	f.browser("docs-owner-a").call("GET", "/api/v4/goals/"+goalID+"/evidence-timeline", nil, 403)

	f.s.Now = func() time.Time { return time.Now().Add(11 * time.Minute) }
	stale := intern.call("POST", "/api/v4/workspaces/"+assignmentID+"/link-preview", Object{"template_id": "db-access-team-a", "template_version": 1}, 201)
	intern.call("POST", "/api/v4/workspaces/"+assignmentID+"/link-confirm", Object{"preview_id": stale["id"], "preview_hash": stale["preview_hash"], "expected_revision": stale["assignment_revision"]}, 409)
	f.s.Now = time.Now

	reportID := "20000000-0000-4000-8000-000000000099"
	f.sql(`INSERT INTO app.task_clarity_reports(id,team_id,owner_id,brief_id,brief_version,section_id,reason,state,current_count,lifetime_count,last_seen,hypothesis,suggestion,enrichment_status)
		VALUES ($1,'team-a',$2,$3,1,'report-format','requirement_unclear','accepted',6,6,now(),'Раздел общий.','Уточните формат.','completed')`, reportID, buddyA, brief["id"])
	proposal := buddy.call("POST", "/api/v4/task-clarity-reports/"+reportID+"/revision-proposals", Object{"expected_report_version": 1, "base_brief_version": 1}, 201)
	change := obj(list(proposal["changes"])[0])
	if proposal["origin"] != "model" || proposal["status"] != "ready" || change["field"] != "sections/report-format/text" || change["label"] != "Формат отчёта" || change["rationale"] == nil {
		t.Fatal(proposal)
	}
	for _, mode := range []string{"bad_revision", "revision_wrong_hash", "revision_wrong_base", "revision_schema"} {
		f.setStream(mode)
		unsafe := buddy.call("POST", "/api/v4/task-clarity-reports/"+reportID+"/revision-proposals", Object{"expected_report_version": 1, "base_brief_version": 1}, 201)
		if unsafe["status"] != "unavailable" || unsafe["origin"] != "rule_based" || len(list(unsafe["changes"])) != 0 {
			t.Fatal(mode, unsafe)
		}
	}
	f.setStream("revision_no_change")
	same := buddy.call("POST", "/api/v4/task-clarity-reports/"+reportID+"/revision-proposals", Object{"expected_report_version": 1, "base_brief_version": 1}, 201)
	if same["status"] != "needs_input" || same["origin"] != "model" || len(list(same["questions"])) != 1 {
		t.Fatal(same)
	}
	f.setStream("revision_offline")
	offline := buddy.call("POST", "/api/v4/task-clarity-reports/"+reportID+"/revision-proposals", Object{"expected_report_version": 1, "base_brief_version": 1}, 201)
	if offline["status"] != "needs_input" || offline["origin"] != "rule_based" || list(offline["questions"])[0] != "Какой формат отчёта нужен?" {
		t.Fatal(offline)
	}
	f.setStream("")
	hash := digest(encode(proposal["changes"]))
	applied := buddy.call("POST", "/api/v4/revision-proposals/"+str(proposal["id"])+"/apply", Object{"selected_change_ids": []any{"c1"}, "expected_draft_revision": nil, "proposal_revision": 1, "preview_hash": hash}, 200)
	if applied["status"] != "applied" {
		t.Fatal(applied)
	}
	again := buddy.call("GET", "/api/v3/task-briefs/"+str(brief["id"]), nil, 200)
	if !strings.Contains(string(encode(again)), "нумерованным списком") {
		t.Fatal(again)
	}
	buddy.call("POST", "/api/v4/revision-proposals/"+str(proposal["id"])+"/apply", Object{"selected_change_ids": []any{"c1"}, "expected_draft_revision": nil, "proposal_revision": 1, "preview_hash": hash}, 409)

	from := time.Now().UTC().Add(-30 * 24 * time.Hour).Format(time.RFC3339)
	to := time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339)
	impact := buddy.call("POST", "/api/v4/task-briefs/"+str(brief["id"])+"/impact-config", Object{
		"before_version": 1, "after_version": 2, "section_id": "report-format", "reason": "requirement_unclear",
		"comparable": true, "from_a": from, "to_a": to, "from_b": from, "to_b": to, "expected_revision": 0,
	}, 200)
	if impact["state"] != "insufficient_data" {
		t.Fatal(impact)
	}
	f.browser("docs-owner-a").call("GET", "/api/v4/task-briefs/"+str(brief["id"])+"/impact", nil, 403)
	if strings.Contains(string(encode(impact)), internA) {
		t.Fatal("impact leaked an intern id")
	}
	stored := buddy.call("GET", "/api/v4/revision-proposals/"+str(offline["id"]), nil, 200)
	discarded := buddy.call("POST", "/api/v4/revision-proposals/"+str(offline["id"])+"/discard", Object{"expected_revision": stored["proposal_revision"]}, 200)
	if discarded["status"] != "discarded" {
		t.Fatal(discarded)
	}
	intern.call("POST", "/api/v4/workspaces/"+assignmentID+"/link-preview", Object{"template_id": "db-access-team-a", "template_version": 2}, 422)
	notComparable := buddy.call("POST", "/api/v4/task-briefs/"+str(brief["id"])+"/impact-config", Object{
		"before_version": 1, "after_version": 2, "section_id": "deadline", "reason": "outcome_unclear",
		"comparable": false, "from_a": from, "to_a": to, "from_b": from, "to_b": to, "expected_revision": 1,
	}, 200)
	if notComparable["state"] != "not_comparable" || notComparable["delta_pp"] != nil {
		t.Fatal(notComparable)
	}
	buddy.call("POST", "/api/v4/revision-proposals/"+str(offline["id"])+"/discard", Object{"expected_revision": 99}, 409)
	buddy.call("GET", "/api/v4/revision-proposals/"+uuid(), nil, 404)
	intern.call("GET", "/api/v4/workspaces/"+uuid(), nil, 404)
	current := intern.call("GET", "/api/v4/workspaces/"+assignmentID, nil, 200)
	intern.call("POST", "/api/v4/workspaces/"+assignmentID+"/link-confirm", Object{"preview_id": uuid(), "preview_hash": strings.Repeat("b", 64), "expected_revision": current["revision"]}, 404)
	buddy.call("POST", "/api/v4/task-briefs/"+str(brief["id"])+"/impact-config", Object{
		"before_version": 1, "after_version": 2, "section_id": "deadline", "reason": "outcome_unclear",
		"comparable": true, "from_a": to, "to_a": from, "from_b": from, "to_b": to, "expected_revision": 2,
	}, 422)
}
