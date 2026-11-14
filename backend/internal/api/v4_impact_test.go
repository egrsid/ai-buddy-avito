package api

import "testing"
import "time"

func TestV4StatusLabels(t *testing.T) {
	if schemaStatus("waiting_external") != "unverified" || technicalStatus("nope") != "unknown" {
		t.Fatal("unknown states")
	}
	if nextAction("verified", true) != "done" || nextAction("ready", true) != "continue" || nextAction("blocked", false) != "confirm_link" {
		t.Fatal("next action")
	}
	if briefTitle(Object{"content": Object{}}) != "Задание" {
		t.Fatal("empty title")
	}
}

func TestImpactArithmetic(t *testing.T) {
	before := cohortView(1, 10, 6)
	after := cohortView(2, 10, 2)
	if before["rate"].(float64) != 0.6 || after["rate"].(float64) != 0.2 {
		t.Fatal(before, after)
	}
	_, _, delta := impactDelta(before, after)
	if delta.(float64) != -40 {
		t.Fatal(delta)
	}
	if cohortView(1, 0, 0)["state"] != "no_exposure" {
		t.Fatal("empty cohort")
	}
	if cohortView(1, 4, 1)["state"] != "insufficient_data" || cohortView(1, 4, 1)["eligible"] != nil {
		t.Fatal("small cohort must hide the count")
	}
	hidden, _, delta := impactDelta(cohortView(1, 10, 1), cohortView(2, 10, 2))
	if hidden["state"] != "suppressed" || hidden["eligible"] != nil || delta != nil {
		t.Fatal(hidden, delta)
	}
	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	asOf := start.Add(8 * 24 * time.Hour)
	if !exposureEligible(start, nil, asOf, start, start.Add(30*24*time.Hour)) {
		t.Fatal("mature open episode")
	}
	earlyEnd := start.Add(24 * time.Hour)
	if exposureEligible(start, &earlyEnd, asOf, start, start.Add(30*24*time.Hour)) {
		t.Fatal("ended before the window")
	}
	if !exposureEligible(start, nil, start.Add(impactWindow), start, start.Add(30*24*time.Hour)) {
		t.Fatal("window is complete at start+H")
	}
	if exposureEligible(start, nil, start.Add(impactWindow-time.Nanosecond), start, start.Add(30*24*time.Hour)) {
		t.Fatal("not mature one instant earlier")
	}
	if exposureEligible(start.Add(-time.Second), nil, asOf, start, start.Add(30*24*time.Hour)) {
		t.Fatal("before enrollment")
	}
}

func TestRevisionReservedFields(t *testing.T) {
	content := Object{"goal": "Исходная цель", "expected_result": "Отчёт", "acceptance_criteria": []any{Object{"id": "result", "text": "Исходный критерий"}}}
	for field, old := range map[string]string{"goal": "Исходная цель", "expected_result": "Отчёт", "acceptance_criteria.result.text": "Исходный критерий"} {
		change := Object{"id": "c1", "field": field, "old_hash": digest([]byte(old)), "replacement": "Уточнённый текст"}
		if !safeRevision(Object{"changes": []any{change}}, str(change["old_hash"])) {
			t.Fatal("safe field rejected")
		}
		if e := applyChanges(content, map[string]Object{field: change}); e != nil {
			t.Fatal(e)
		}
		if e := applyChanges(content, map[string]Object{field: change}); e == nil {
			t.Fatal("stale field overwritten")
		}
	}
	if sectionBody(content, "goal") != "Уточнённый текст" || sectionBody(content, "expected_result") != "Уточнённый текст" || sectionBody(content, "acceptance_criteria") != "Уточнённый текст" {
		t.Fatal(content)
	}
	if sectionBody(Object{}, "acceptance_criteria") != "" {
		t.Fatal("empty criteria")
	}
}
