package api

import (
	"strings"
	"testing"
)

func TestV4RevisionGoalAndCriteria(t *testing.T) {
	f := newFixture(t)
	buddy := f.browser("buddy-a")
	brief, _ := buddy.publishedBrief(internA)
	goalReport := "20000000-0000-4000-8000-000000000097"
	criteriaReport := "20000000-0000-4000-8000-000000000098"
	for id, section := range map[string]string{goalReport: "goal", criteriaReport: "acceptance_criteria"} {
		f.sql(`INSERT INTO app.task_clarity_reports(id,team_id,owner_id,brief_id,brief_version,section_id,reason,state,current_count,lifetime_count,last_seen,hypothesis,suggestion,enrichment_status)
			VALUES ($1,'team-a',$2,$3,1,$4,'outcome_unclear','accepted',2,2,now(),'Неясно.','Уточните.','completed')`, id, buddyA, brief["id"], section)
	}
	body := Object{"expected_report_version": 1, "base_brief_version": 1}
	goal := buddy.call("POST", "/api/v4/task-clarity-reports/"+goalReport+"/revision-proposals", body, 201)
	criteria := buddy.call("POST", "/api/v4/task-clarity-reports/"+criteriaReport+"/revision-proposals", body, 201)
	if obj(list(goal["changes"])[0])["field"] != "goal" || obj(list(criteria["changes"])[0])["field"] != "acceptance_criteria/steps/text" {
		t.Fatal(goal, criteria)
	}
	applied := buddy.call("POST", "/api/v4/revision-proposals/"+str(goal["id"])+"/apply", Object{"selected_change_ids": []any{"c1"}, "expected_draft_revision": nil, "proposal_revision": 1, "preview_hash": digest(encode(goal["changes"]))}, 200)
	if applied["status"] != "applied" {
		t.Fatal(applied)
	}
	buddy.call("POST", "/api/v4/revision-proposals/"+str(criteria["id"])+"/apply", Object{"selected_change_ids": []any{"c1"}, "expected_draft_revision": 2, "proposal_revision": 1, "preview_hash": digest(encode(criteria["changes"]))}, 200)
	draft := f.count("SELECT count(*) FROM app.task_brief_versions WHERE brief_id=$1 AND state='draft' AND content->>'goal'='Опишите шаги нумерованным списком.' AND content->'acceptance_criteria'->0->>'text'='Опишите шаги нумерованным списком.'", brief["id"])
	if draft != 1 {
		t.Fatal("goal and criterion were not written into one draft")
	}
}

func TestReportedFields(t *testing.T) {
	content := briefContent("ТЗ", "Отчёт понятен.")
	content["sections"] = append(list(content["sections"]), Object{"id": "Bad ID", "title": "", "text": "x"}, Object{"id": "empty", "title": "", "text": "  "})
	cases := map[string]string{"goal": "goal", "expected_result": "expected_result", "acceptance_criteria": "acceptance_criteria/steps/text", "report-format": "sections/report-format/text"}
	for section, path := range cases {
		fields := reportedFields(content, section)
		if len(fields) != 1 || fields[0].Path != path {
			t.Fatal(section, fields)
		}
	}
	for _, section := range []string{"Bad ID", "empty", "missing"} {
		if len(reportedFields(content, section)) != 0 {
			t.Fatal(section)
		}
	}
	content["sections"] = []any{Object{"id": "untitled", "text": "Текст"}}
	if reportedFields(content, "untitled")[0].Label != "Раздел" {
		t.Fatal("default label")
	}
}

func TestRevisionDraftRequestBounds(t *testing.T) {
	fields := []briefField{{"goal", "Цель", "Текст", 2000}}
	low := revisionDraftRequest(Object{}, Object{"section_id": "goal", "reason": "outcome_unclear", "lifetime_count": 1, "brief_version": 1, "hypothesis": " "}, fields, strings.Repeat("a", 64))
	if low["brief_title"] != "Задание" || obj(low["report"])["affected_count"] != 2 || obj(low["report"])["hypothesis"] != nil {
		t.Fatal(low)
	}
	high := revisionDraftRequest(Object{"title": "ТЗ"}, Object{"lifetime_count": 500, "hypothesis": "Гипотеза"}, fields, "")
	if obj(high["report"])["affected_count"] != 100 || obj(high["report"])["hypothesis"] != "Гипотеза" {
		t.Fatal(high)
	}
	if cutRunes("абв", 2) != "аб" || cutRunes("аб", 2) != "аб" {
		t.Fatal("cutRunes")
	}
}

func TestMapRevisionDraftRejects(t *testing.T) {
	field := briefField{"goal", "Цель", "Старый текст", 20}
	base := strings.Repeat("a", 64)
	good := func() Object {
		return Object{"base_hash": base, "base_version": 1, "outcome": "ready", "questions": []any{},
			"changes": []any{Object{"id": "c1", "path": "goal", "old_hash": field.hash(), "replacement": "Новый текст"}}}
	}
	if status, origin, changes, _, e := mapRevisionDraft(good(), []briefField{field}, base, 1); e != nil || status != "ready" || origin != "model" || obj(changes[0])["label"] != nil {
		t.Fatal(status, origin, changes, e)
	}
	broken := map[string]func(Object){
		"version":    func(d Object) { d["base_version"] = 2 },
		"path":       func(d Object) { obj(list(d["changes"])[0])["path"] = "expected_result" },
		"same":       func(d Object) { obj(list(d["changes"])[0])["replacement"] = "Старый текст" },
		"long":       func(d Object) { obj(list(d["changes"])[0])["replacement"] = strings.Repeat("я", 21) },
		"markup":     func(d Object) { obj(list(d["changes"])[0])["replacement"] = "a > b" },
		"duplicate":  func(d Object) { d["changes"] = append(list(d["changes"]), list(d["changes"])[0]) },
		"empty":      func(d Object) { d["changes"] = []any{} },
		"ask+change": func(d Object) { d["outcome"], d["questions"] = "needs_input", []any{Object{"text": "?"}} },
		"ask none":   func(d Object) { d["outcome"], d["changes"] = "needs_input", []any{} },
		"no_change":  func(d Object) { d["outcome"] = "no_change" },
		"outcome":    func(d Object) { d["outcome"] = "maybe" },
	}
	for name, breakIt := range broken {
		d := good()
		breakIt(d)
		if _, _, _, _, e := mapRevisionDraft(d, []briefField{field}, base, 1); e == nil {
			t.Fatal(name)
		}
	}
}

func TestApplyFieldRejects(t *testing.T) {
	content := briefContent("ТЗ", "Отчёт понятен.")
	change := Object{"old_hash": strings.Repeat("a", 64), "replacement": "Новое"}
	for path, code := range map[string]int{"goal": 409, "sections/report-format/text": 409, "sections/missing/text": 422, "sections/x": 422, "refs/x/text": 422} {
		if e := applyField(content, path, change); e == nil || e.(problem).status != code {
			t.Fatal(path, e)
		}
	}
}
