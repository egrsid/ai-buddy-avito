package api

import (
	"fmt"
	"net/http"
)

func (s *Server) feedbackRoutes(m *http.ServeMux) {
	s.route(m, "GET /api/v2/escalations", "", "", false, listEscalations)
	s.route(m, "GET /api/v2/escalations/{id}", "", "", false, getEscalation)
	s.route(m, "POST /api/v2/escalations/{id}/reply", "EscalationReplyRequest", "buddy", false, replyEscalation)
	s.route(m, "GET /api/v2/friction-groups", "", "documentation_owner", false, listFriction)
	s.route(m, "GET /api/v2/knowledge-gaps", "", "documentation_owner", false, listCandidates)
	s.route(m, "GET /api/v2/knowledge-gaps/{id}", "", "documentation_owner", false, getCandidate)
	s.route(m, "POST /api/v2/knowledge-gaps/{id}/review", "CandidateReviewRequest", "documentation_owner", true, reviewCandidate)
}
func (q *request) friction(g, step Object, attempt, code, kind, status string) error {
	ref := obj(step["instruction_reference"])
	key := str(g["journey_id"]) + ":" + str(step["id"]) + ":" + code + ":" + str(q.user["team_id"]) + ":" + str(g["resource_id"])
	if e := q.exec("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", key); e != nil {
		return e
	}
	if e := q.exec("INSERT INTO app.friction_events VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (attempt_id,error_code) DO NOTHING", uuid(), g["journey_id"], g["journey_version"], g["id"], step["id"], q.user["id"], code, kind, attempt, status, ref["document_id"], ref["version"], q.s.Now()); e != nil {
		return e
	}
	if status == "unavailable" {
		return nil
	}
	var count int
	e := q.tx.QueryRow(q.Context, "SELECT count(DISTINCT f.intern_id) FROM app.friction_events f JOIN app.goals g ON g.id=f.goal_id JOIN app.users u ON u.id=f.intern_id WHERE f.journey_id=$1 AND f.step_id=$2 AND f.error_code=$3 AND g.resource_id=$4 AND u.team=$5 AND f.outcome='failed'", g["journey_id"], step["id"], code, g["resource_id"], q.user["team_id"]).Scan(&count)
	if e != nil {
		return e
	}
	if count < 2 {
		return nil
	}
	if count > 100 {
		count = 100
	}
	refs := []any{ref}
	id := uuid()
	enrichment := "failed"
	hypothesis := fmt.Sprintf("Повторяется %s на одном шаге у разных стажёров. Ответственному следует проверить полноту инструкции.", code)
	fix := "Проверить разрешённую инструкцию и описать безопасное восстановление; изменение публикуется только после человеческого ревью."
	// Enrichment receives a safe aggregate and an owner's scope, never intern IDs, logs or chat.
	var exists bool
	e = q.tx.QueryRow(q.Context, "SELECT EXISTS(SELECT 1 FROM app.knowledge_gap_candidates WHERE journey_id=$1 AND step_id=$2 AND error_code=$3 AND team_id=$4 AND resource_id=$5)", g["journey_id"], step["id"], code, q.user["team_id"], g["resource_id"]).Scan(&exists)
	if e != nil {
		return e
	}
	if !exists {
		owners, e := q.many("SELECT jsonb_build_object('id',u.id) FROM app.users u JOIN app.role_assignments r ON r.user_id=u.id AND r.role='documentation_owner' WHERE u.team=$1 ORDER BY u.id LIMIT 20", q.user["team_id"])
		if e != nil {
			return e
		}
		for _, row := range owners {
			u, e := q.one(userSQL, obj(row)["id"])
			if e != nil {
				return e
			}
			scope, e := q.scope(u)
			if e != nil {
				return e
			}
			yes, e := q.canRead(str(ref["document_id"]), u)
			if e != nil {
				return e
			}
			if !yes {
				continue
			}
			input := Object{"access_scope": scope, "journey_id": g["journey_id"], "step_id": step["id"], "error_code": code, "affected_count": count, "instruction_refs": refs}
			draft, e := q.call(q.s.Config.AIURL, "POST", "/internal/v2/knowledge-gap-draft", "ai/KnowledgeGapDraftResponse", input, nil)
			if e == nil && digest(encode(draft["source_refs"])) == digest(encode(refs)) {
				hypothesis = clean(str(draft["hypothesis"]))
				fix = clean(str(draft["proposed_fix"]))
				enrichment = "completed"
			}
			break
		}
	}
	if e = q.exec("INSERT INTO app.knowledge_gap_candidates(id,journey_id,step_id,error_code,team_id,resource_id,instruction_refs,affected_count,hypothesis,proposed_fix,state,enrichment_status) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,'proposed',$11) ON CONFLICT (journey_id,step_id,error_code,team_id,resource_id) DO UPDATE SET affected_count=EXCLUDED.affected_count,version=app.knowledge_gap_candidates.version+CASE WHEN app.knowledge_gap_candidates.affected_count<>EXCLUDED.affected_count THEN 1 ELSE 0 END,updated_at=CASE WHEN app.knowledge_gap_candidates.affected_count<>EXCLUDED.affected_count THEN now() ELSE app.knowledge_gap_candidates.updated_at END", id, g["journey_id"], step["id"], code, q.user["team_id"], g["resource_id"], string(encode(refs)), count, hypothesis, fix, enrichment); e != nil {
		return e
	}
	if !exists {
		if e = q.event(uuid(), "knowledge_gap_candidate_created", "go_friction_pipeline", "candidate", id, attempt, Object{"candidate_id": id, "journey_id": g["journey_id"], "step_id": step["id"], "error_code": code, "affected_count": count}); e != nil {
			return e
		}
	}

	return q.exec("INSERT INTO app.candidate_contributions SELECT c.id,f.intern_id FROM app.knowledge_gap_candidates c JOIN app.friction_events f ON f.journey_id=c.journey_id AND f.step_id=c.step_id AND f.error_code=c.error_code JOIN app.goals g ON g.id=f.goal_id AND g.resource_id=c.resource_id JOIN app.users u ON u.id=f.intern_id AND u.team=c.team_id WHERE c.journey_id=$1 AND c.step_id=$2 AND c.error_code=$3 AND c.team_id=$4 AND c.resource_id=$5 ON CONFLICT DO NOTHING", g["journey_id"], step["id"], code, q.user["team_id"], g["resource_id"])
}

const candidateJSON = `jsonb_strip_nulls(to_jsonb(c)-'team_id'-'resource_id')`

func (q *request) candidate(id string) (Object, error) {
	c, e := q.one("SELECT to_jsonb(c) FROM app.knowledge_gap_candidates c WHERE id=$1 AND team_id=$2 FOR UPDATE", id, q.user["team_id"])
	if e != nil {
		return nil, e
	}
	if !q.assigned(str(c["resource_id"])) || !q.canReview(c["instruction_refs"]) {
		return nil, fail(404, "NOT_FOUND")
	}
	if c["resolved_reference"] != nil && !q.canReview([]any{c["resolved_reference"]}) {
		return nil, fail(404, "NOT_FOUND")
	}
	delete(c, "team_id")
	delete(c, "resource_id")
	if c["resolved_reference"] == nil {
		delete(c, "resolved_reference")
	}
	return c, nil
}
func getCandidate(q *request) (response, error) {
	c, e := q.candidate(q.r.PathValue("id"))
	return out("Candidate", c), e
}
func candidateItems(q *request) ([]any, error) {
	rows, e := q.many("SELECT jsonb_build_object('id',id) FROM app.knowledge_gap_candidates WHERE team_id=$1 ORDER BY created_at DESC LIMIT 100", q.user["team_id"])
	if e != nil {
		return nil, e
	}
	items := []any{}
	for _, r := range rows {
		c, e := q.candidate(str(obj(r)["id"]))
		if e != nil {
			continue
		}
		items = append(items, c)
	}
	return items, nil
}
func listCandidates(q *request) (response, error) {
	items, e := candidateItems(q)
	return out("CandidateList", Object{"items": items}), e
}
func listFriction(q *request) (response, error) {
	items, e := candidateItems(q)
	if e != nil {
		return response{}, e
	}
	result := []any{}
	for _, item := range items {
		c := obj(item)
		result = append(result, Object{"journey_id": c["journey_id"], "step_id": c["step_id"], "error_code": c["error_code"], "affected_count": c["affected_count"], "instruction_refs": c["instruction_refs"]})
	}
	return out("FrictionAggregateList", Object{"items": result}), nil
}
func reviewCandidate(q *request) (response, error) {
	c, e := q.candidate(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if num(c["version"]) != num(q.body["expected_version"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	state, decision := str(c["state"]), str(q.body["decision"])
	allowed := state == "proposed" && decision == "under_review" || state == "under_review" && (decision == "accepted" || decision == "rejected") || state == "accepted" && decision == "resolved"
	if !allowed {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	var resolved any
	if decision == "resolved" {
		resolved = q.body["resolved_reference"]
		for _, old := range list(c["instruction_refs"]) {
			ref := obj(old)
			if ref["document_id"] == obj(resolved)["document_id"] && num(obj(resolved)["version"]) <= num(ref["version"]) {
				return response{}, fail(409, "VERSION_CONFLICT")
			}
		}

		if !q.canReview([]any{resolved}) {
			return response{}, fail(404, "NOT_FOUND")
		}
		doc, e := q.knowledge(str(obj(resolved)["document_id"]), q.user)
		if e != nil {
			return response{}, e
		}
		if num(doc["version"]) != num(obj(resolved)["version"]) {
			return response{}, fail(409, "VERSION_CONFLICT")
		}
	}
	var raw any
	if resolved != nil {
		raw = string(encode(resolved))
	}
	rid := uuid()
	if e = q.exec("UPDATE app.knowledge_gap_candidates SET state=$2,resolved_reference=$3::jsonb,version=version+1,updated_at=$4 WHERE id=$1", c["id"], decision, raw, q.s.Now()); e != nil {
		return response{}, e
	}
	if e = q.exec("INSERT INTO app.candidate_reviews(id,candidate_id,actor_id,decision,reason) VALUES ($1,$2,$3,$4,$5)", rid, c["id"], q.user["id"], decision, clean(str(q.body["reason"]))); e != nil {
		return response{}, e
	}
	if e = q.event(uuid(), "knowledge_gap_reviewed", "go_knowledge_gap_review", "candidate", str(c["id"]), rid, Object{"candidate_id": c["id"], "review_id": rid, "decision": decision}); e != nil {
		return response{}, e
	}
	c, e = q.candidate(str(c["id"]))
	return out("Candidate", c), e
}
func (q *request) escalation(id string) (Object, error) {
	e, e1 := q.one("SELECT to_jsonb(e) FROM app.escalations e WHERE id=$1 AND goal_id IS NOT NULL FOR UPDATE", id)
	if e1 != nil {
		return nil, e1
	}
	intern, e1 := q.one(userSQL, e["intern_id"])
	if e1 != nil {
		return nil, e1
	}
	buddy, e1 := q.one(userSQL, e["buddy_id"])
	if e1 != nil {
		return nil, e1
	}
	if intern["buddy_id"] != e["buddy_id"] || intern["team_id"] != buddy["team_id"] || !has(buddy["roles"], "buddy") {
		return nil, fail(404, "NOT_FOUND")
	}
	if !(q.user["id"] == intern["id"] && has(q.user["roles"], "intern") || q.user["id"] == buddy["id"] && has(q.user["roles"], "buddy")) {
		return nil, fail(404, "NOT_FOUND")
	}
	g, e1 := q.one("SELECT to_jsonb(g) FROM app.goals g WHERE id=$1", e["goal_id"])
	if e1 != nil {
		return nil, e1
	}
	if !hasResource(intern, str(g["resource_id"])) || !hasResource(buddy, str(g["resource_id"])) {
		return nil, fail(404, "NOT_FOUND")
	}
	snapshot := obj(e["diagnostic_snapshot"])
	refs := []any{}
	for _, v := range list(snapshot["instruction_refs"]) {
		ref := obj(v)
		a, er := q.canRead(str(ref["document_id"]), intern)
		if er != nil {
			return nil, er
		}
		b, er := q.canRead(str(ref["document_id"]), buddy)
		if er != nil {
			return nil, er
		}
		if a && b {
			sources, er := q.sources([]any{ref}, q.user)
			if er == nil {
				refs = append(refs, sources...)
			}
		}
	}
	if len(refs) != len(list(snapshot["instruction_refs"])) {
		snapshot["hypotheses"] = []any{}
	}
	snapshot["instruction_refs"] = refs
	result := Object{"id": e["id"], "goal_id": e["goal_id"], "step_id": e["step_id"], "blocker_id": e["blocker_id"], "intern": Object{"id": intern["id"], "display_name": intern["display_name"]}, "buddy": Object{"id": buddy["id"], "display_name": buddy["display_name"]}, "diagnostic_snapshot": snapshot, "status": e["status"], "version": e["version"], "created_at": e["created_at"]}
	if e["answer"] != nil {
		result["answer"] = e["answer"]
		result["resolved_at"] = e["resolved_at"]
	}
	return result, nil
}
func getEscalation(q *request) (response, error) {
	e, err := q.escalation(q.r.PathValue("id"))
	return out("Escalation", e), err
}
func listEscalations(q *request) (response, error) {
	rows, e := q.many("SELECT jsonb_build_object('id',id) FROM app.escalations WHERE goal_id IS NOT NULL AND (intern_id=$1 OR buddy_id=$1) ORDER BY created_at DESC LIMIT 100", q.user["id"])
	if e != nil {
		return response{}, e
	}
	items := []any{}
	for _, r := range rows {
		esc, err := q.escalation(str(obj(r)["id"]))
		if err == nil {
			items = append(items, esc)
		}
	}
	return out("EscalationList", Object{"items": items}), nil
}

// replyEscalation: v3 keeps old escalations read-only; an answer goes to Telegram, not here.
func replyEscalation(q *request) (response, error) {
	if _, e := q.escalation(q.r.PathValue("id")); e != nil {
		return response{}, e
	}
	return response{}, fail(403, "FORBIDDEN")
}
