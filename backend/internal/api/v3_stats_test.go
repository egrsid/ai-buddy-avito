package api

import (
	"strings"
	"testing"
	"time"
)

func TestGoalSummariesPaging(t *testing.T) {
	f := newFixture(t)
	intern := f.browser("intern-a")
	if v := intern.call("GET", "/api/v3/goals", nil, 200); len(list(v["items"])) != 0 || v["next_cursor"] != nil {
		t.Fatal(v)
	}
	g := intern.goal()
	page := intern.call("GET", "/api/v3/goals", nil, 200)
	item := obj(list(page["items"])[0])
	p := obj(item["progress"])
	if item["title"] != "Доступ к БД команды A" || num(item["step_count"]) != 3 || num(p["verified"]) != 1 || num(p["total"]) != 3 || num(p["percent"]) != 33 {
		t.Fatal(item)
	}
	// Two earlier verified goals; the list shows each as its own card, newest first.
	f.setGrant(internA, true)
	for i := 1; i <= 2; i++ {
		id := uuid()
		f.sql("INSERT INTO app.goals(id,intern_id,journey_id,journey_version,content_hash,resource_id,status,version,created_at,updated_at) SELECT $1,$2,journey_id,version,content_hash,resource_id,'verified',1,now()-make_interval(hours=>$3),now() FROM app.journey_templates WHERE journey_id='db-access-team-a'", id, internA, i)
		f.sql("INSERT INTO app.step_progress(goal_id,step_id,state,version) SELECT $1,s,'verified',1 FROM unnest(ARRAY['select_resource','check_access','check_connection']) s", id)
	}
	seen := map[string]bool{}
	cursor := ""
	for pages := 0; pages < 5; pages++ {
		path := "/api/v3/goals?limit=1"
		if cursor != "" {
			path += "&cursor=" + cursor
		}
		v := intern.call("GET", path, nil, 200)
		for _, it := range list(v["items"]) {
			if seen[str(obj(it)["id"])] {
				t.Fatal("duplicate goal across pages")
			}
			seen[str(obj(it)["id"])] = true
		}
		if v["next_cursor"] == nil {
			break
		}
		cursor = str(v["next_cursor"])
	}
	if len(seen) != 3 || !seen[str(g["id"])] {
		t.Fatal(seen)
	}
	all := list(intern.call("GET", "/api/v3/goals", nil, 200)["items"])
	if len(all) != 3 || obj(all[0])["id"] != g["id"] || num(obj(obj(all[1])["progress"])["percent"]) != 100 {
		t.Fatal(all)
	}
	// Re-checking a revoked grant cannot reopen an old verified goal next to the active one
	// (one active goal per journey); that card is skipped instead of failing the whole list.
	f.setGrant(internA, false)
	if v := list(intern.call("GET", "/api/v3/goals", nil, 200)["items"]); len(v) != 1 || obj(v[0])["id"] != g["id"] {
		t.Fatal(v)
	}
	for _, bad := range []string{"?limit=0", "?limit=21", "?limit=x", "?cursor=@@", "?cursor=YWJj", "?cursor=" + goalCursor(time.Now(), "bad"), "?other=1", "?limit=1&limit=2"} {
		intern.call("GET", "/api/v3/goals"+bad, nil, 422)
	}
	if v := f.browser("intern-b").call("GET", "/api/v3/goals", nil, 200); len(list(v["items"])) != 0 {
		t.Fatal("foreign goals listed")
	}
	f.browser("buddy-a").call("GET", "/api/v3/goals", nil, 403)
	if v := progress(0, 0); num(v["percent"]) != 0 {
		t.Fatal(v)
	}
}

// difficulties drives two interns of team A into ACCESS_MISSING and DB_SSL_REQUIRED.
func (f *fixture) difficulties() {
	for _, account := range []string{"intern-a", "intern-b"} {
		b := f.browser(account)
		g := b.goal()
		id := internA
		if account == "intern-b" {
			id = internB
		}
		f.setGrant(id, true)
		g = b.call("GET", "/goals/"+str(g["id"]), nil, 200)
		b.check(g, "check_access", "", 201)
		g = b.call("GET", "/goals/"+str(g["id"]), nil, 200)
		b.check(g, "check_connection", "disable", 201)
		if account == "intern-a" {
			g = b.call("GET", "/goals/"+str(g["id"]), nil, 200)
			b.check(g, "check_connection", "disable", 201)
		}
	}
}

func rowFor(stats Object, field, value string) Object {
	for _, r := range list(stats["rows"]) {
		if obj(obj(r)["key"])[field] == value {
			return obj(r)
		}
	}
	return nil
}

func TestDifficultyStatistics(t *testing.T) {
	f := newFixture(t)
	f.difficulties()
	// A single-intern group: shown without numbers and left out of totals.
	f.sql("INSERT INTO app.friction_events SELECT gen_random_uuid(),journey_id,journey_version,id,'check_connection',intern_id,'ACCESS_DENIED','access_denied',gen_random_uuid(),'failed','0000000a-0000-4000-8000-00000000000a',1,now() FROM app.goals WHERE intern_id=$1", internA)
	// An unavailable check is an operational failure, not a difficulty.
	f.sql("INSERT INTO app.friction_events SELECT gen_random_uuid(),journey_id,journey_version,id,'check_connection',intern_id,'CHECK_UNAVAILABLE','check_unavailable',gen_random_uuid(),'unavailable','0000000a-0000-4000-8000-00000000000a',1,now() FROM app.goals")
	events := f.count("SELECT count(*) FROM app.business_events")
	buddy := f.browser("buddy-a")
	stats := buddy.call("GET", "/api/v3/statistics/mentor", nil, 200)
	ssl, access, denied := rowFor(stats, "error_code", "DB_SSL_REQUIRED"), rowFor(stats, "error_code", "ACCESS_MISSING"), rowFor(stats, "error_code", "ACCESS_DENIED")
	if stats["source_kind"] != "technical" || len(list(stats["rows"])) != 3 || ssl == nil || access == nil || denied == nil || rowFor(stats, "error_code", "CHECK_UNAVAILABLE") != nil {
		t.Fatal(stats)
	}
	m := obj(ssl["metrics"])
	if num(m["affected_interns"]) != 2 || num(m["observations"]) != 3 || num(m["open_items"]) != 2 || ssl["label"] != "Проверить подключение · DB_SSL_REQUIRED" {
		t.Fatal(ssl)
	}
	last := obj(obj(list(stats["rows"])[2])["key"])
	if d := obj(denied["metrics"]); d["suppressed"] != true || d["affected_interns"] != nil || last["error_code"] != "ACCESS_DENIED" {
		t.Fatal(denied)
	}
	summary := obj(stats["summary"])
	if num(summary["affected_interns"]) != 2 || num(summary["observations"]) != 3+num(obj(access["metrics"])["observations"]) || summary["suppressed"] != false {
		t.Fatal(summary)
	}
	daily := list(stats["daily"])
	today := obj(daily[len(daily)-1])
	if len(daily) != 30 || num(today["affected_interns"]) != 2 || today["date"] != time.Now().In(moscow).Format("2006-01-02") {
		t.Fatal(today)
	}
	if strings.Contains(string(encode(stats)), internA) || strings.Contains(string(encode(stats)), "intern-a") {
		t.Fatal("statistics leak interns")
	}
	// Paging, window and validation.
	first := buddy.call("GET", "/api/v3/statistics/mentor?limit=1&days=7", nil, 200)
	if len(list(first["rows"])) != 1 || first["next_cursor"] != "1" || len(list(first["daily"])) != 7 {
		t.Fatal(first)
	}
	second := buddy.call("GET", "/api/v3/statistics/mentor?limit=1&days=7&cursor=1&source=technical", nil, 200)
	if obj(list(second["rows"])[0])["label"] == obj(list(first["rows"])[0])["label"] {
		t.Fatal("cursor repeated a row")
	}
	if v := buddy.call("GET", "/api/v3/statistics/mentor?cursor=99", nil, 200); len(list(v["rows"])) != 0 {
		t.Fatal(v)
	}
	f.sql("UPDATE app.friction_events SET occurred_at=now()-interval '10 days'")
	if v := buddy.call("GET", "/api/v3/statistics/mentor?days=7", nil, 200); len(list(v["rows"])) != 0 || num(obj(v["summary"])["affected_interns"]) != 0 {
		t.Fatal(v)
	}
	if v := buddy.call("GET", "/api/v3/statistics/mentor?days=90", nil, 200); len(list(v["rows"])) != 3 || len(list(v["daily"])) != 90 {
		t.Fatal(v)
	}
	for _, bad := range []string{"?days=5", "?source=hr", "?cursor=0", "?limit=51", "?intern_id=" + internA} {
		buddy.call("GET", "/api/v3/statistics/mentor"+bad, nil, 422)
	}
	f.browser("intern-a").call("GET", "/api/v3/statistics/mentor", nil, 403)
	buddy.call("GET", "/api/v3/statistics/documentation", nil, 403)
	if v := f.browser("buddy-b").call("GET", "/api/v3/statistics/mentor?days=90", nil, 200); len(list(v["rows"])) != 0 {
		t.Fatal("other mentor sees team A interns")
	}

	// Documentation owner: per instruction version, with the related candidate.
	owner := f.browser("docs-owner-a")
	docs := owner.call("GET", "/api/v3/statistics/documentation?days=30", nil, 200)
	row := rowFor(docs, "error_code", "DB_SSL_REQUIRED")
	if row == nil || obj(row["key"])["document_id"] != docA || len(list(row["related_reports"])) != 1 || obj(list(row["related_reports"])[0])["kind"] != "knowledge_gap_candidate" {
		t.Fatal(docs)
	}
	owner.call("GET", "/api/v3/statistics/documentation?source=technical", nil, 422)
	f.sql("DELETE FROM app.document_permissions WHERE subject_id='10000000-0000-4000-8000-000000000007' AND permission='knowledge_gap.review'")
	defer f.sql("INSERT INTO app.document_permissions VALUES ($1,'10000000-0000-4000-8000-000000000007','knowledge_gap.review')", docA)
	if v := owner.call("GET", "/api/v3/statistics/documentation?days=30", nil, 200); len(list(v["rows"])) != 0 {
		t.Fatal("revoked owner still sees rows")
	}
	if f.count("SELECT count(*) FROM app.business_events") != events {
		t.Fatal("statistics wrote events")
	}
}

func TestTaskClarityStatistics(t *testing.T) {
	f := newFixture(t)
	buddy := f.browser("buddy-a")
	_, assignments := buddy.publishedBrief(internA, internB)
	for i, account := range []string{"intern-a", "intern-b"} {
		b := f.browser(account)
		b.call("POST", "/api/v3/task-assignments/"+str(assignments[i]["id"])+"/frictions", Object{"section_id": "deadline", "reason": "outcome_unclear"}, 201)
		b.call("POST", "/api/v3/task-assignments/"+str(assignments[i]["id"])+"/frictions", Object{"section_id": "deadline", "reason": "outcome_unclear"}, 201)
	}
	f.browser("intern-a").call("POST", "/api/v3/task-assignments/"+str(assignments[0]["id"])+"/frictions", Object{"section_id": "goal", "reason": "requirement_unclear"}, 201)
	stats := buddy.call("GET", "/api/v3/statistics/mentor?source=task_clarity", nil, 200)
	row := rowFor(stats, "section_id", "deadline")
	if stats["source_kind"] != "task_clarity" || row == nil || num(obj(row["metrics"])["affected_interns"]) != 2 || num(obj(row["metrics"])["observations"]) != 2 || num(obj(row["metrics"])["open_items"]) != 1 {
		t.Fatal(stats)
	}
	if row["label"] != "ТЗ: отчёт · v1 · Срок · непонятно, какой результат нужен" || obj(list(row["related_reports"])[0])["kind"] != "task_clarity_report" {
		t.Fatal(row)
	}
	if goal := rowFor(stats, "section_id", "goal"); goal == nil || obj(goal["metrics"])["suppressed"] != true {
		t.Fatal(goal)
	}
	if v := f.browser("buddy-b").call("GET", "/api/v3/statistics/mentor?source=task_clarity", nil, 200); len(list(v["rows"])) != 0 || obj(v["summary"])["suppressed"] != false {
		t.Fatal(v)
	}
	// Only hidden groups: the total is hidden as well instead of a misleading zero.
	f.sql("DELETE FROM app.task_frictions WHERE section_id='deadline'")
	if v := buddy.call("GET", "/api/v3/statistics/mentor?source=task_clarity", nil, 200); obj(v["summary"])["suppressed"] != true {
		t.Fatal(v)
	}
}
