package api

import (
	"context"
	"fmt"
	"time"
)

// Task clarity feedback: a structured "this section is unclear" mark from an intern. Two distinct
// interns of one group (team, author, brief, version, section, reason) within 30 days give one
// report to the brief author. Counting, window and dedup happen here, inside one transaction.

const clarityWindow = 30 * 24 * time.Hour
const clarityThreshold = 2

var reasonText = map[string]string{
	"requirement_unclear": "непонятно требование",
	"outcome_unclear":     "непонятно, какой результат нужен",
	"acceptance_unclear":  "непонятно, как работу примут",
}

// clarityDraft is the deterministic offline text; it names the place in the brief, never people.
func clarityDraft(section, reason string, version, count int) (string, string) {
	hypothesis := fmt.Sprintf("Разные стажёры (%d) независимо отметили раздел «%s» версии %d: %s. Возможно, формулировка допускает несколько толкований или опирается на контекст, которого у новичка нет. Это наблюдение о тексте задания, а не оценка работы наставника или стажёров.", count, section, version, reasonText[reason])
	suggestion := fmt.Sprintf("Уточните раздел «%s»: добавьте пример ожидаемого результата и проверяемый критерий. Новую версию публикует только автор; текущие назначения останутся на версии %d до явного перехода.", section, version)
	return hypothesis, suggestion
}

func reportFriction(q *request) (response, error) {
	a, e := q.assignment(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if a["viewer_is_intern"] != true {
		return response{}, fail(404, "NOT_FOUND")
	}
	content := obj(a["content"])
	sid, reason := str(q.body["section_id"]), str(q.body["reason"])
	title, ok := sectionTitle(content, sid)
	if !ok {
		return response{}, fail(422, "VALIDATION_ERROR")
	}
	version := num(a["brief_version"])
	group := []any{a["team_id"], a["owner_id"], a["brief_id"], version, sid, reason}
	key := fmt.Sprint(group...)
	if e = q.exec("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "task-clarity:"+key); e != nil {
		return response{}, e
	}
	now := q.s.Now()
	var inserted bool
	// A repeat by the same intern only moves last_seen; it never adds a second contribution.
	e = q.tx.QueryRow(q.Context, "INSERT INTO app.task_frictions(id,assignment_id,team_id,owner_id,brief_id,brief_version,section_id,reason,intern_id,first_seen,last_seen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) ON CONFLICT (team_id,owner_id,brief_id,brief_version,section_id,reason,intern_id) DO UPDATE SET last_seen=GREATEST(app.task_frictions.last_seen,EXCLUDED.last_seen) RETURNING (xmax=0)", uuid(), a["id"], a["team_id"], a["owner_id"], a["brief_id"], version, sid, reason, q.user["id"], now).Scan(&inserted)
	if e != nil {
		return response{}, e
	}
	status := "already_recorded"
	if inserted {
		status = "recorded"
		if e = q.taskEvent("task_friction_reported", "go_task_workflow", "task_assignment", str(a["id"]), Object{"assignment_id": a["id"], "brief_id": a["brief_id"], "brief_version": version, "section_id": sid, "reason": reason}); e != nil {
			return response{}, e
		}
	}
	if e = q.updateClarityReport(a, content, sid, title, reason, version, now); e != nil {
		return response{}, e
	}
	return created3("FrictionReceipt", Object{"status": status, "assignment_id": a["id"], "brief_version": version, "section_id": sid, "reason": reason}), nil
}

func (q *request) updateClarityReport(a, content Object, sid, title, reason string, version int, now time.Time) error {
	var current, lifetime int
	var last time.Time
	e := q.tx.QueryRow(q.Context, "SELECT count(DISTINCT intern_id) FILTER (WHERE last_seen>$7),count(DISTINCT intern_id),max(last_seen) FROM app.task_frictions WHERE team_id=$1 AND owner_id=$2 AND brief_id=$3 AND brief_version=$4 AND section_id=$5 AND reason=$6", a["team_id"], a["owner_id"], a["brief_id"], version, sid, reason, now.Add(-clarityWindow)).Scan(&current, &lifetime, &last)
	if e != nil {
		return e
	}
	current, lifetime = min(current, 100), min(lifetime, 100)
	// An existing report keeps its human decision; only the counters move.
	tag, e := q.tx.Exec(q.Context, "UPDATE app.task_clarity_reports SET current_count=$7,lifetime_count=$8,last_seen=$9,version=version+CASE WHEN current_count<>$7 OR lifetime_count<>$8 THEN 1 ELSE 0 END,updated_at=CASE WHEN current_count<>$7 OR lifetime_count<>$8 THEN $10 ELSE updated_at END WHERE team_id=$1 AND owner_id=$2 AND brief_id=$3 AND brief_version=$4 AND section_id=$5 AND reason=$6", a["team_id"], a["owner_id"], a["brief_id"], version, sid, reason, current, lifetime, last, now)
	if e != nil || tag.RowsAffected() > 0 || current < clarityThreshold {
		return e
	}
	hypothesis, suggestion := clarityDraft(title, reason, version, current)
	id := uuid()
	// The report row is reserved before any AI call, so AI failure cannot lose or duplicate it.
	if e = q.exec("INSERT INTO app.task_clarity_reports(id,team_id,owner_id,brief_id,brief_version,section_id,reason,current_count,lifetime_count,last_seen,hypothesis,suggestion,enrichment_status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$13)", id, a["team_id"], a["owner_id"], a["brief_id"], version, sid, reason, current, lifetime, last, hypothesis, suggestion, now); e != nil {
		return e
	}
	input := Object{"brief_title": content["title"], "brief_version": version, "section": Object{"id": sid, "title": title, "text": sectionText(content, sid)}, "reason": reason, "affected_count": current}
	if q.s.Validate("v3/ai/TaskClarityDraftRequest", input) != nil {
		if e = q.exec("UPDATE app.task_clarity_reports SET enrichment_status='failed' WHERE id=$1", id); e != nil {
			return e
		}
	} else {
		// The model may need longer than an intern should wait: the report is already saved
		// with the offline text, and the AI draft replaces it after the commit.
		q.after = append(q.after, func() { q.s.enrichReport(id, input) })
	}
	return q.taskEvent("task_clarity_threshold_reached", "go_task_workflow", "task_clarity_report", id, Object{"report_id": id, "brief_id": a["brief_id"], "brief_version": version, "section_id": sid, "reason": reason})
}

// report is readable only by the current author of the brief in the brief's team.
func (q *request) report(id string) (Object, error) {
	r, e := q.one("SELECT to_jsonb(r)||jsonb_build_object('content',v.content,'latest',(SELECT max(version) FROM app.task_brief_versions WHERE brief_id=r.brief_id AND state='published')) FROM app.task_clarity_reports r JOIN app.task_briefs b ON b.id=r.brief_id AND b.owner_id=r.owner_id AND b.team_id=r.team_id JOIN app.task_brief_versions v ON v.brief_id=r.brief_id AND v.version=r.brief_version WHERE r.id=$1 AND r.owner_id=$2 AND r.team_id=$3 FOR UPDATE OF r", id, q.user["id"], q.user["team_id"])
	if e != nil {
		return nil, e
	}
	var current int
	if e = q.tx.QueryRow(q.Context, "SELECT count(DISTINCT intern_id) FROM app.task_frictions WHERE team_id=$1 AND owner_id=$2 AND brief_id=$3 AND brief_version=$4 AND section_id=$5 AND reason=$6 AND last_seen>$7", r["team_id"], r["owner_id"], r["brief_id"], r["brief_version"], r["section_id"], r["reason"], q.s.Now().Add(-clarityWindow)).Scan(&current); e != nil {
		return nil, e
	}
	r["current_count"] = current
	content := obj(r["content"])
	title, _ := sectionTitle(content, str(r["section_id"]))
	if title == "" {
		title = str(r["section_id"])
	}
	dto := Object{"id": r["id"], "brief_id": r["brief_id"], "brief_title": content["title"], "brief_version": r["brief_version"], "latest_published_version": r["latest"], "section_id": r["section_id"], "section_title": title, "reason": r["reason"], "state": r["state"], "current_count": r["current_count"], "lifetime_count": r["lifetime_count"], "last_seen_at": r["last_seen"], "hypothesis": r["hypothesis"], "suggestion": r["suggestion"], "enrichment_status": r["enrichment_status"], "version": r["version"], "created_at": r["created_at"], "updated_at": r["updated_at"]}
	if r["resolved_version"] != nil {
		dto["resolved_version"] = r["resolved_version"]
	}
	return dto, nil
}

func listReports(q *request) (response, error) {
	rows, e := q.many("SELECT jsonb_build_object('id',id) FROM app.task_clarity_reports WHERE owner_id=$1 AND team_id=$2 ORDER BY created_at DESC,id LIMIT 100", q.user["id"], q.user["team_id"])
	if e != nil {
		return response{}, e
	}
	items := []any{}
	for _, row := range rows {
		r, e := q.report(str(obj(row)["id"]))
		if e != nil {
			continue
		}
		items = append(items, r)
	}
	return out3("TaskClarityReportList", Object{"items": items}), nil
}

func getReport(q *request) (response, error) {
	r, e := q.report(q.r.PathValue("id"))
	return out3("TaskClarityReport", r), e
}

// reviewReport follows the knowledge gap review states. "resolved" needs a published successor
// version of the same brief that the author published by hand; the review itself publishes nothing.
func reviewReport(q *request) (response, error) {
	r, e := q.report(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if num(r["version"]) != num(q.body["expected_version"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	state, decision := str(r["state"]), str(q.body["decision"])
	allowed := state == "proposed" && decision == "under_review" || state == "under_review" && (decision == "accepted" || decision == "rejected") || state == "accepted" && decision == "resolved"
	if !allowed {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	var resolved any
	if decision == "resolved" {
		resolved = num(q.body["resolved_version"])
		published, e := q.publishedVersion(r["brief_id"], resolved)
		if e != nil {
			return response{}, e
		}
		if !published || num(resolved) <= num(r["brief_version"]) {
			return response{}, fail(409, "VERSION_CONFLICT")
		}
	}
	if e = q.exec("UPDATE app.task_clarity_reports SET state=$2,resolved_version=$3,version=version+1,updated_at=$4 WHERE id=$1", r["id"], decision, resolved, q.s.Now()); e != nil {
		return response{}, e
	}
	if e = q.exec("INSERT INTO app.task_clarity_reviews(id,report_id,actor_id,decision,reason,created_at) VALUES ($1,$2,$3,$4,$5,$6)", uuid(), r["id"], q.user["id"], decision, clean(str(q.body["reason"])), q.s.Now()); e != nil {
		return response{}, e
	}
	if e = q.taskEvent("task_clarity_reviewed", "go_task_workflow", "task_clarity_report", str(r["id"]), Object{"report_id": r["id"], "decision": decision}); e != nil {
		return response{}, e
	}
	r, e = q.report(str(r["id"]))
	return out3("TaskClarityReport", r), e
}

// enrichReport asks the AI service for a hypothesis and stores it only while the report still
// waits for it. Any failure keeps the deterministic text and marks the enrichment as failed.
func (s *Server) enrichReport(id string, input Object) {
	ctx, cancel := context.WithTimeout(context.Background(), s.Config.EnrichTimeout)
	defer cancel()
	q := &request{Context: ctx, s: s, requestID: uuid(), client: s.slowClient(s.Config.EnrichTimeout)}
	draft, e := q.call(s.Config.AIURL, "POST", "/internal/v3/task-clarity-draft", "v3/ai/TaskClarityDraftResponse", input, nil)
	if e != nil {
		_, _ = s.Pool.Exec(context.Background(), "UPDATE app.task_clarity_reports SET enrichment_status='failed' WHERE id=$1 AND enrichment_status='pending'", id)
		return
	}
	_, _ = s.Pool.Exec(context.Background(), "UPDATE app.task_clarity_reports SET hypothesis=$2,suggestion=$3,enrichment_status='completed' WHERE id=$1 AND enrichment_status='pending'", id, clean(str(draft["hypothesis"])), clean(str(draft["suggestion"])))
}
