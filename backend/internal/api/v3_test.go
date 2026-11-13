package api

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

const internC = "10000000-0000-4000-8000-000000000005"

func briefContent(title, criterion string) Object {
	return Object{
		"title": title,
		"goal":  "Подготовить отчёт о подключении.",
		"sections": []any{
			Object{"id": "report-format", "title": "Формат отчёта", "text": "Опишите шаги в свободной форме."},
			Object{"id": "deadline", "title": "Срок", "text": "До конца недели."},
		},
		"expected_result":     "Отчёт в документе команды.",
		"acceptance_criteria": []any{Object{"id": "steps", "text": criterion}},
		"refs":                []any{Object{"document_id": docA, "version": 1}},
	}
}

// publishedBrief creates and publishes a brief by buddy-a and assigns it to the given interns.
func (b *browser) publishedBrief(interns ...string) (Object, []Object) {
	brief := b.call("POST", "/api/v3/task-briefs", Object{"content": briefContent("ТЗ: отчёт", "Отчёт понятен.")}, 201)
	brief = b.call("POST", "/api/v3/task-briefs/"+str(brief["id"])+"/publish", Object{"expected_revision": brief["revision"]}, 200)
	assignments := []Object{}
	for _, intern := range interns {
		assignments = append(assignments, b.call("POST", "/api/v3/task-assignments", Object{"brief_id": brief["id"], "brief_version": 1, "intern_id": intern}, 201))
	}
	return brief, assignments
}

func (f *fixture) count(query string, args ...any) int {
	f.t.Helper()
	var n int
	if e := f.admin.QueryRow(context.Background(), query, args...).Scan(&n); e != nil {
		f.t.Fatal(e)
	}
	return n
}

func TestMentorContactPreviewAndExport(t *testing.T) {
	f := newFixture(t)
	intern := f.browser("intern-a")
	contact := intern.call("GET", "/api/v3/me/mentor-contact", nil, 200)
	if contact["status"] != "available" || contact["telegram_url"] != "https://t.me/ai_buddy_demo_mentor_a" || contact["display_name"] != "buddy-a" {
		t.Fatal(contact)
	}
	f.browser("buddy-a").call("GET", "/api/v3/me/mentor-contact", nil, 403)
	f.sql("DELETE FROM app.mentor_contacts WHERE mentor_id='10000000-0000-4000-8000-000000000002'")
	if v := f.browser("intern-c").call("GET", "/api/v3/me/mentor-contact", nil, 200); v["status"] != "missing" || v["telegram_url"] != nil {
		t.Fatal(v)
	}
	f.browser("intern-c").call("POST", "/api/v3/mentor-contact-preview", Object{"goal_id": uuid(), "step_id": "check_access"}, 404)

	g := intern.goal()
	question := "Как включить SSL? password=hunter2 и почта intern@example.com"
	preview := intern.call("POST", "/api/v3/mentor-contact-preview", Object{"goal_id": g["id"], "step_id": "check_access", "question": question}, 201)
	text := str(preview["text"])
	for _, want := range []string{"Доступ к БД команды A", "Проверить доступ", "ACCESS_MISSING", "Последняя проверка (доступ в IAM): не пройдена", "Инструкция: SSL инструкция (версия 1)", "[redacted]"} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q in %s", want, text)
		}
	}
	for _, leak := range []string{"hunter2", "example.com", internA, buddyA} {
		if strings.Contains(text, leak) {
			t.Fatalf("leak %q in %s", leak, text)
		}
	}
	export := Object{"preview_id": preview["id"], "content_hash": preview["content_hash"], "contact_revision": preview["contact_revision"]}
	copied := intern.call("POST", "/api/v3/mentor-contact-export", export, 200)
	if copied["text"] != text || copied["telegram_url"] != "https://t.me/ai_buddy_demo_mentor_a" {
		t.Fatal(copied)
	}
	// Neither preview nor copy creates an internal escalation or changes the goal.
	if f.count("SELECT count(*) FROM app.escalations")+f.count("SELECT count(*) FROM app.actions") != 0 {
		t.Fatal("contact created an internal escalation")
	}
	if after := intern.call("GET", "/goals/"+str(g["id"]), nil, 200); num(after["version"]) != num(g["version"]) {
		t.Fatal("contact changed goal state")
	}
	f.browser("intern-b").call("POST", "/api/v3/mentor-contact-export", export, 404)
	f.browser("intern-b").call("POST", "/api/v3/mentor-contact-preview", Object{"goal_id": g["id"], "step_id": "check_access"}, 404)
	intern.call("POST", "/api/v3/mentor-contact-preview", Object{"goal_id": g["id"], "step_id": "unknown"}, 404)
	intern.call("POST", "/api/v3/mentor-contact-preview", Object{"goal_id": g["id"], "step_id": "check_access", "assignment_id": uuid()}, 422)
	bad := clone(export)
	bad["content_hash"] = strings.Repeat("0", 64)
	intern.call("POST", "/api/v3/mentor-contact-export", bad, 409)

	// Contact revision change, document revoke for the mentor and expiry each invalidate the copy.
	f.sql("UPDATE app.mentor_contacts SET revision=2 WHERE mentor_id=$1", buddyA)
	intern.call("POST", "/api/v3/mentor-contact-export", export, 409)
	f.sql("UPDATE app.mentor_contacts SET revision=1 WHERE mentor_id=$1", buddyA)
	intern.call("POST", "/api/v3/mentor-contact-export", export, 200)
	f.sql("DELETE FROM app.document_permissions WHERE subject_id=$1 AND document_id=$2", buddyA, docA)
	intern.call("POST", "/api/v3/mentor-contact-export", export, 409)
	fresh := intern.call("POST", "/api/v3/mentor-contact-preview", Object{"goal_id": g["id"], "step_id": "check_access"}, 201)
	if strings.Contains(str(fresh["text"]), "Инструкция:") {
		t.Fatal("document the mentor cannot read entered the copy")
	}
	f.sql("UPDATE app.contact_previews SET expires_at=now()-interval '1 minute' WHERE id=$1", fresh["id"])
	intern.call("POST", "/api/v3/mentor-contact-export", Object{"preview_id": fresh["id"], "content_hash": fresh["content_hash"], "contact_revision": 1}, 409)
	// A goal the intern no longer owns cannot be exported either.
	f.sql("INSERT INTO app.document_permissions VALUES ($1,$2,'knowledge.read')", docA, buddyA)
	p2 := intern.call("POST", "/api/v3/mentor-contact-preview", Object{"goal_id": g["id"], "step_id": "check_access"}, 201)
	f.sql("DELETE FROM app.resource_assignments WHERE user_id=$1", internA)
	intern.call("POST", "/api/v3/mentor-contact-export", Object{"preview_id": p2["id"], "content_hash": p2["content_hash"], "contact_revision": 1}, 409)
	f.sql("INSERT INTO app.resource_assignments VALUES ($1,$2,'db_reader')", internA, resourceA)
}

func TestContactFromAssignmentSection(t *testing.T) {
	f := newFixture(t)
	buddy := f.browser("buddy-a")
	_, assignments := buddy.publishedBrief(internA)
	intern := f.browser("intern-a")
	id := assignments[0]["id"]
	p := intern.call("POST", "/api/v3/mentor-contact-preview", Object{"assignment_id": id, "section_id": "acceptance_criteria", "question": "Что считается готовым?"}, 201)
	for _, want := range []string{"Задание: ТЗ: отчёт (версия 1)", "Раздел: Критерии приёмки", "Вопрос: Что считается готовым?"} {
		if !strings.Contains(str(p["text"]), want) {
			t.Fatal(p["text"])
		}
	}
	intern.call("POST", "/api/v3/mentor-contact-preview", Object{"assignment_id": id, "section_id": "missing"}, 422)
	intern.call("POST", "/api/v3/mentor-contact-preview", Object{"assignment_id": id}, 201)
	f.browser("intern-b").call("POST", "/api/v3/mentor-contact-preview", Object{"assignment_id": id}, 404)
	// The brief author is not the intern: an author-only view cannot become an intern export.
	f.sql("UPDATE app.users SET buddy_id=NULL WHERE id=$1", internA)
	defer f.sql("UPDATE app.users SET buddy_id=$2 WHERE id=$1", internA, buddyA)
	if v := intern.call("GET", "/api/v3/me/mentor-contact", nil, 200); v["status"] != "missing" {
		t.Fatal(v)
	}
}

func TestTaskBriefLifecycle(t *testing.T) {
	f := newFixture(t)
	buddy := f.browser("buddy-a")
	intern := f.browser("intern-a")
	intern.call("POST", "/api/v3/task-briefs", Object{"content": briefContent("x", "y")}, 403)
	for _, broken := range []func(Object){
		func(c Object) { list(c["sections"])[1].(Object)["id"] = "report-format" },
		func(c Object) { list(c["sections"])[0].(Object)["id"] = "goal" },
		func(c Object) {
			c["acceptance_criteria"] = []any{Object{"id": "a", "text": "1"}, Object{"id": "a", "text": "2"}}
		},
		func(c Object) {
			c["refs"] = []any{Object{"document_id": "0000000d-0000-4000-8000-00000000000d", "version": 1}}
		},
		func(c Object) { c["refs"] = []any{Object{"document_id": docA, "version": 7}} },
		func(c Object) { c["owner_id"] = buddyA },
	} {
		c := briefContent("ТЗ", "Критерий")
		broken(c)
		buddy.call("POST", "/api/v3/task-briefs", Object{"content": c}, 422)
	}
	content := briefContent("ТЗ token=abc", "Отчёт понятен.")
	brief := buddy.call("POST", "/api/v3/task-briefs", Object{"content": content}, 201)
	if brief["state"] != "draft" || brief["latest_published_version"] != nil || strings.Contains(str(brief["title"]), "abc") {
		t.Fatal(brief)
	}
	id := str(brief["id"])
	path := "/api/v3/task-briefs/" + id
	buddy.call("POST", path+"/publish", Object{"expected_revision": 99}, 409)
	content["title"] = "ТЗ: отчёт"
	buddy.call("POST", path+"/draft", Object{"content": content, "expected_revision": 99}, 409)
	brief = buddy.call("POST", path+"/draft", Object{"content": content, "expected_revision": brief["revision"]}, 200)
	brief = buddy.call("POST", path+"/publish", Object{"expected_revision": brief["revision"]}, 200)
	if brief["state"] != "published" || brief["draft"] != nil || num(obj(brief["latest_published_version"])["version"]) != 1 || brief["title"] != "ТЗ: отчёт" {
		t.Fatal(brief)
	}
	buddy.call("POST", path+"/publish", Object{"expected_revision": brief["revision"]}, 409)
	f.browser("buddy-b").call("GET", path, nil, 404)
	intern.call("GET", path, nil, 403)
	if _, e := f.admin.Exec(context.Background(), "UPDATE app.task_brief_versions SET content='{}' WHERE brief_id=$1", id); e == nil {
		t.Fatal("published version was mutable")
	}
	interns := list(buddy.call("GET", "/api/v3/mentor/interns", nil, 200)["items"])
	if len(interns) != 2 || strings.Contains(string(encode(interns)), internC) {
		t.Fatal(interns)
	}
	buddy.call("POST", "/api/v3/task-assignments", Object{"brief_id": id, "brief_version": 1, "intern_id": internC}, 404)
	buddy.call("POST", "/api/v3/task-assignments", Object{"brief_id": id, "brief_version": 1, "intern_id": buddyA}, 404)
	buddy.call("POST", "/api/v3/task-assignments", Object{"brief_id": id, "brief_version": 2, "intern_id": internA}, 409)
	f.browser("buddy-b").call("POST", "/api/v3/task-assignments", Object{"brief_id": id, "brief_version": 1, "intern_id": internA}, 404)
	a := buddy.call("POST", "/api/v3/task-assignments", Object{"brief_id": id, "brief_version": 1, "intern_id": internA}, 201)
	buddy.call("POST", "/api/v3/task-assignments", Object{"brief_id": id, "brief_version": 1, "intern_id": internA}, 409)
	if a["verification"] != "not_verified" || obj(a["intern"])["id"] != internA || obj(a["author"])["id"] != buddyA {
		t.Fatal(a)
	}

	// Successor draft and v2 publication do not move the existing assignment.
	brief = buddy.call("GET", path, nil, 200)
	content["acceptance_criteria"] = []any{Object{"id": "steps", "text": "В отчёте пять шагов и вывод проверки."}}
	brief = buddy.call("POST", path+"/draft", Object{"content": content, "expected_revision": brief["revision"]}, 200)
	if num(obj(brief["draft"])["version"]) != 2 || num(obj(brief["latest_published_version"])["version"]) != 1 {
		t.Fatal(brief)
	}
	brief = buddy.call("POST", path+"/publish", Object{"expected_revision": brief["revision"]}, 200)
	mine := intern.call("GET", "/api/v3/task-assignments/"+str(a["id"]), nil, 200)
	if num(mine["brief_version"]) != 1 || num(mine["latest_published_version"]) != 2 {
		t.Fatal(mine)
	}
	if len(list(intern.call("GET", "/api/v3/task-assignments", nil, 200)["items"])) != 1 || len(list(buddy.call("GET", "/api/v3/task-assignments", nil, 200)["items"])) != 1 {
		t.Fatal("assignment lists")
	}
	f.browser("intern-b").call("GET", "/api/v3/task-assignments/"+str(a["id"]), nil, 404)
	f.browser("buddy-b").call("GET", "/api/v3/task-assignments/"+str(a["id"]), nil, 404)
	adopt := "/api/v3/task-assignments/" + str(a["id"]) + "/adopt-version"
	intern.call("POST", adopt, Object{"brief_version": 2, "expected_revision": 9}, 409)
	intern.call("POST", adopt, Object{"brief_version": 3, "expected_revision": mine["revision"]}, 409)
	mine = intern.call("POST", adopt, Object{"brief_version": 2, "expected_revision": mine["revision"]}, 200)
	if num(mine["brief_version"]) != 2 || !strings.Contains(string(encode(mine["content"])), "пять шагов") {
		t.Fatal(mine)
	}
	intern.call("POST", adopt, Object{"brief_version": 1, "expected_revision": mine["revision"]}, 409)
	if len(list(buddy.call("GET", "/api/v3/task-briefs", nil, 200)["items"])) != 1 {
		t.Fatal("brief list")
	}

	brief = buddy.call("POST", path+"/archive", Object{"expected_revision": brief["revision"]}, 200)
	if brief["state"] != "archived" {
		t.Fatal(brief)
	}
	buddy.call("POST", path+"/archive", Object{"expected_revision": brief["revision"]}, 409)
	buddy.call("POST", path+"/draft", Object{"content": content, "expected_revision": brief["revision"]}, 409)
	buddy.call("POST", "/api/v3/task-assignments", Object{"brief_id": id, "brief_version": 2, "intern_id": internB}, 409)
	if v := intern.call("GET", "/api/v3/task-assignments/"+str(a["id"]), nil, 200); v["brief_state"] != "archived" {
		t.Fatal(v)
	}
	if f.count("SELECT count(*) FROM app.business_events WHERE event_type IN ('brief_published','task_assigned','task_assignment_adopted','brief_archived')") != 5 {
		t.Fatal("task events")
	}
	// A moved author loses the brief and its assignments.
	f.sql("UPDATE app.users SET team='team-b' WHERE id=$1", buddyA)
	defer f.sql("UPDATE app.users SET team='team-a' WHERE id=$1", buddyA)
	buddy.call("GET", path, nil, 404)
	buddy.call("GET", "/api/v3/task-assignments/"+str(a["id"]), nil, 404)
}

func TestTaskClarityReportFlow(t *testing.T) {
	f := newFixture(t)
	buddy := f.browser("buddy-a")
	brief, assignments := buddy.publishedBrief(internA, internB)
	a, b := f.browser("intern-a"), f.browser("intern-b")
	mark := func(br *browser, assignment Object, section, reason string, status int) Object {
		return br.call("POST", "/api/v3/task-assignments/"+str(assignment["id"])+"/frictions", Object{"section_id": section, "reason": reason}, status)
	}
	// AI enrichment runs after the commit: wait until no report is still pending.
	reports := func() []any {
		for i := 0; ; i++ {
			items := list(buddy.call("GET", "/api/v3/task-clarity-reports", nil, 200)["items"])
			pending := false
			for _, item := range items {
				pending = pending || obj(item)["enrichment_status"] == "pending"
			}
			if !pending || i == 100 {
				return items
			}
			time.Sleep(20 * time.Millisecond)
		}
	}
	if v := mark(a, assignments[0], "acceptance_criteria", "acceptance_unclear", 201); v["status"] != "recorded" {
		t.Fatal(v)
	}
	if v := mark(a, assignments[0], "acceptance_criteria", "acceptance_unclear", 201); v["status"] != "already_recorded" {
		t.Fatal(v)
	}
	mark(a, assignments[0], "deadline", "acceptance_unclear", 201)
	mark(a, assignments[0], "unknown", "acceptance_unclear", 422)
	mark(a, assignments[0], "deadline", "too_hard", 422)
	mark(b, assignments[0], "deadline", "acceptance_unclear", 404)
	buddy.call("POST", "/api/v3/task-assignments/"+str(assignments[0]["id"])+"/frictions", Object{"section_id": "deadline", "reason": "outcome_unclear"}, 403)
	if len(reports()) != 0 {
		t.Fatal("one intern reached the threshold")
	}
	// The author sees no per-intern marks; the intern sees only own marks.
	if v := buddy.call("GET", "/api/v3/task-assignments/"+str(assignments[0]["id"]), nil, 200); len(list(v["reported_sections"])) != 0 {
		t.Fatal(v)
	}
	if v := a.call("GET", "/api/v3/task-assignments/"+str(assignments[0]["id"]), nil, 200); len(list(v["reported_sections"])) != 2 {
		t.Fatal(v)
	}

	mark(b, assignments[1], "acceptance_criteria", "acceptance_unclear", 201)
	mark(b, assignments[1], "acceptance_criteria", "acceptance_unclear", 201)
	items := reports()
	if len(items) != 1 {
		t.Fatal(items)
	}
	r := obj(items[0])
	if num(r["current_count"]) != 2 || num(r["lifetime_count"]) != 2 || r["section_title"] != "Критерии приёмки" || r["enrichment_status"] != "completed" || r["state"] != "proposed" || r["hypothesis"] != "Критерий приёмки звучит неоднозначно." {
		t.Fatal(r)
	}
	for _, leak := range []string{internA, internB, "intern-a", "intern-b"} {
		if strings.Contains(string(encode(r)), leak) {
			t.Fatal("report leaks interns")
		}
	}
	f.browser("buddy-b").call("GET", "/api/v3/task-clarity-reports/"+str(r["id"]), nil, 404)
	a.call("GET", "/api/v3/task-clarity-reports", nil, 403)
	if f.count("SELECT count(*) FROM app.business_events WHERE event_type='task_clarity_threshold_reached'") != 1 || f.count("SELECT count(*) FROM app.business_events WHERE payload ? 'intern_id'") != 0 {
		t.Fatal("events")
	}

	// AI outage keeps the same report with the deterministic text.
	f.setStream("ai_unavailable")
	mark(a, assignments[0], "report-format", "requirement_unclear", 201)
	mark(b, assignments[1], "report-format", "requirement_unclear", 201)
	settled := reports()
	f.setStream("")
	var offline Object
	for _, item := range settled {
		if obj(item)["section_id"] == "report-format" {
			offline = obj(item)
		}
	}
	if offline == nil || offline["enrichment_status"] != "failed" || !strings.Contains(str(offline["hypothesis"]), "«Формат отчёта» версии 1") {
		t.Fatal(offline)
	}

	// Review: under_review -> accepted -> resolved only with a newer published version.
	path := "/api/v3/task-clarity-reports/" + str(r["id"]) + "/review"
	buddy.call("POST", path, Object{"decision": "accepted", "reason": "x", "expected_version": r["version"]}, 409)
	buddy.call("POST", path, Object{"decision": "under_review", "reason": "x", "expected_version": 99}, 409)
	r = buddy.call("POST", path, Object{"decision": "under_review", "reason": "Смотрю", "expected_version": r["version"]}, 200)
	r = buddy.call("POST", path, Object{"decision": "accepted", "reason": "Согласен", "expected_version": r["version"]}, 200)
	if r["state"] != "accepted" || num(r["latest_published_version"]) != 1 {
		t.Fatal("accepted must not publish anything", r)
	}
	buddy.call("POST", path, Object{"decision": "resolved", "reason": "Исправлено", "expected_version": r["version"], "resolved_version": 1}, 409)
	id := str(brief["id"])
	current := buddy.call("GET", "/api/v3/task-briefs/"+id, nil, 200)
	draft := buddy.call("POST", "/api/v3/task-briefs/"+id+"/draft", Object{"content": briefContent("ТЗ: отчёт", "Отчёт содержит шаги и вывод проверки."), "expected_revision": current["revision"]}, 200)
	buddy.call("POST", path, Object{"decision": "resolved", "reason": "Ещё черновик", "expected_version": r["version"], "resolved_version": 2}, 409)
	buddy.call("POST", "/api/v3/task-briefs/"+id+"/publish", Object{"expected_revision": draft["revision"]}, 200)
	key := uuid()
	r = buddy.keyed("POST", path, Object{"decision": "resolved", "reason": "Опубликована v2", "expected_version": r["version"], "resolved_version": 2}, key, 200)
	if r["state"] != "resolved" || num(r["resolved_version"]) != 2 {
		t.Fatal(r)
	}
	buddy.keyed("POST", path, Object{"decision": "resolved", "reason": "Опубликована v2", "expected_version": num(r["version"]) - 1, "resolved_version": 2}, key, 200)

	// Old assignments stay on v1; a repeat in v1 keeps the resolved state; v2 is a new group.
	mark(a, assignments[0], "acceptance_criteria", "acceptance_unclear", 201)
	if v := buddy.call("GET", "/api/v3/task-clarity-reports/"+str(r["id"]), nil, 200); v["state"] != "resolved" {
		t.Fatal(v)
	}
	adopted := a.call("POST", "/api/v3/task-assignments/"+str(assignments[0]["id"])+"/adopt-version", Object{"brief_version": 2, "expected_revision": 1}, 200)
	mark(a, adopted, "acceptance_criteria", "acceptance_unclear", 201)
	if len(reports()) != 2 {
		t.Fatal("v2 group must start from zero")
	}
	// Outside the 30-day window an old contribution does not count toward a new report.
	f.sql("UPDATE app.task_frictions SET first_seen=now()-interval '40 days',last_seen=now()-interval '31 days' WHERE brief_version=2")
	b.call("POST", "/api/v3/task-assignments/"+str(assignments[1]["id"])+"/adopt-version", Object{"brief_version": 2, "expected_revision": 1}, 200)
	mark(b, assignments[1], "acceptance_criteria", "acceptance_unclear", 201)
	if len(reports()) != 2 {
		t.Fatal("stale contribution reached the threshold")
	}
	if f.count("SELECT count(*) FROM app.goals")+f.count("SELECT count(*) FROM app.escalations") != 0 {
		t.Fatal("task feedback touched goals or escalations")
	}
	// An enrichment cut by a restart keeps the offline text and is marked failed.
	f.sql("UPDATE app.task_clarity_reports SET enrichment_status='pending'")
	if e := f.s.Recover(context.Background()); e != nil {
		t.Fatal(e)
	}
	if f.count("SELECT count(*) FROM app.task_clarity_reports WHERE enrichment_status='pending'") != 0 {
		t.Fatal("pending enrichment survived restart")
	}
}

func TestConcurrentTaskFrictionDedup(t *testing.T) {
	f := newFixture(t)
	buddy := f.browser("buddy-a")
	_, assignments := buddy.publishedBrief(internA, internB)
	interns := []*browser{f.browser("intern-a"), f.browser("intern-b")}
	var wg sync.WaitGroup
	for round := 0; round < 3; round++ {
		for i, b := range interns {
			wg.Add(1)
			go func(b *browser, a Object) {
				defer wg.Done()
				r := b.raw("POST", "/api/v3/task-assignments/"+str(a["id"])+"/frictions", Object{"section_id": "deadline", "reason": "outcome_unclear"}, nil)
				r.Body.Close()
			}(b, assignments[i])
		}
	}
	wg.Wait()
	if f.count("SELECT count(*) FROM app.task_clarity_reports") != 1 || f.count("SELECT count(*) FROM app.task_frictions") != 2 {
		t.Fatal("concurrent marks duplicated contributions or reports")
	}
	var current int
	_ = f.admin.QueryRow(context.Background(), "SELECT current_count FROM app.task_clarity_reports").Scan(&current)
	if current != 2 {
		t.Fatal(current)
	}
}

func TestTaskReplaysReauthorize(t *testing.T) {
	f := newFixture(t)
	buddy := f.browser("buddy-a")
	key := uuid()
	brief := buddy.keyed("POST", "/api/v3/task-briefs", Object{"content": briefContent("ТЗ", "Критерий")}, key, 201)
	if again := buddy.keyed("POST", "/api/v3/task-briefs", Object{"content": briefContent("ТЗ", "Критерий")}, key, 201); again["id"] != brief["id"] {
		t.Fatal("replay created a second brief")
	}
	brief = buddy.call("POST", "/api/v3/task-briefs/"+str(brief["id"])+"/publish", Object{"expected_revision": brief["revision"]}, 200)
	assignKey, frictionKey := uuid(), uuid()
	body := Object{"brief_id": brief["id"], "brief_version": 1, "intern_id": internA}
	a := buddy.keyed("POST", "/api/v3/task-assignments", body, assignKey, 201)
	buddy.keyed("POST", "/api/v3/task-assignments", body, assignKey, 201)
	intern := f.browser("intern-a")
	friction := Object{"section_id": "deadline", "reason": "outcome_unclear"}
	intern.keyed("POST", "/api/v3/task-assignments/"+str(a["id"])+"/frictions", friction, frictionKey, 201)
	intern.keyed("POST", "/api/v3/task-assignments/"+str(a["id"])+"/frictions", friction, frictionKey, 201)
	// After the team move the stored result is not replayed to a caller who lost access.
	f.sql("UPDATE app.users SET team='team-b' WHERE id IN ($1,$2)", buddyA, internA)
	defer f.sql("UPDATE app.users SET team='team-a' WHERE id IN ($1,$2)", buddyA, internA)
	buddy.keyed("POST", "/api/v3/task-briefs", Object{"content": briefContent("ТЗ", "Критерий")}, key, 404)
	buddy.keyed("POST", "/api/v3/task-assignments", body, assignKey, 404)
	intern.keyed("POST", "/api/v3/task-assignments/"+str(a["id"])+"/frictions", friction, frictionKey, 404)
}

func TestV3StartupNeedsContracts(t *testing.T) {
	f := newFixture(t)
	_, e := New(f.s.Pool, Config{Env: "test", Origin: "http://frontend.test", Token: "t", AIURL: "http://ai.test", MockURL: "http://mock.test", Contracts: "../../../contracts/v2", ContractsV3: t.TempDir()})
	if e == nil {
		t.Fatal("missing v3 contracts must fail startup")
	}
	if _, e = New(f.s.Pool, Config{Env: "test", Origin: "http://frontend.test", Token: "t", AIURL: "http://ai.test", MockURL: "http://mock.test", Contracts: "../../../contracts/v2"}); e != nil {
		t.Fatal(e)
	}
}

func TestResponseOriginPersisted(t *testing.T) {
	f := newFixture(t)
	a := f.browser("intern-a")
	g := a.goal()
	c := a.context(g, "check_access")
	ask := func(mode string) (Object, string) {
		f.setStream(mode)
		run := a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "Что делать?"}, 201)
		events := a.events(str(run["id"]))
		return a.call("GET", "/runs/"+str(run["id"]), nil, 200), events
	}
	reserve, events := ask("origin")
	if reserve["status"] != "completed" || !strings.Contains(events, "event: message.origin") || !strings.Contains(events, `"answered_by":"secondary"`) {
		t.Fatal(events)
	}
	plain, _ := ask("normal")
	twice, _ := ask("origin_twice")
	cut, _ := ask("eof")
	if twice["status"] != "failed" || twice["error_code"] != "AI_SCHEMA_INVALID" {
		t.Fatal(twice)
	}
	items := list(a.call("GET", "/api/v3/conversations/"+str(c["id"])+"/message-origins", nil, 200)["items"])
	byMessage := map[string]Object{}
	for _, item := range items {
		byMessage[str(obj(item)["message_id"])] = obj(obj(item)["origin"])
	}
	if o := byMessage[str(reserve["assistant_message_id"])]; o["answered_by"] != "secondary" || o["completion"] != "complete" || o["reason_code"] != "timeout" {
		t.Fatal(o)
	}
	if o := byMessage[str(plain["assistant_message_id"])]; o["answered_by"] != "unknown" || o["mode"] != "unknown" {
		t.Fatal("origin without an AI report must stay unknown", o)
	}
	for _, r := range []Object{twice, cut} {
		if o := byMessage[str(r["assistant_message_id"])]; o["completion"] != "interrupted" {
			t.Fatal("a failed run is not a complete answer", o)
		}
	}
	f.browser("intern-b").call("GET", "/api/v3/conversations/"+str(c["id"])+"/message-origins", nil, 404)
}
