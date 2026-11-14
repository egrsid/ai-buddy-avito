package api

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"time"
)

var secretPattern = regexp.MustCompile(`(?i)(bearer\s+\S+|(?:password|token|api[_-]?key|secret)\s*[:=]\s*\S+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})`)

func clean(s string) string { return secretPattern.ReplaceAllString(s, "[redacted]") }
func (s *Server) actionRoutes(m *http.ServeMux) {
	s.route(m, "POST /api/v2/actions", "ActionDraft", "intern", true, createAction)
	s.route(m, "GET /api/v2/actions/{id}", "", "intern", false, getAction)
	s.route(m, "POST /api/v2/actions/{id}/confirm", "EmptyBody", "intern", false, confirmAction)
	s.route(m, "POST /api/v2/actions/{id}/cancel", "EmptyBody", "intern", false, cancelAction)
	s.route(m, "GET /api/v2/access-requests", "", "", false, listAccessRequests)
	s.route(m, "GET /api/v2/access-requests/{id}", "", "", false, getAccessRequest)
	s.route(m, "POST /api/v2/access-requests/{id}/decision", "AccessDecisionRequest", "access_approver", true, decideAccess)
	s.route(m, "GET /api/v2/knowledge/{id}", "", "", false, getKnowledge)
}
func createAction(q *request) (response, error) {
	a, e := q.draft(q.body, "")
	return created("Action", a), e
}
func (q *request) draft(d Object, run string) (Object, error) {
	if q.s.Validate("public/ActionDraft", d) != nil {
		return nil, fail(422, "VALIDATION_ERROR")
	}
	g, e := q.goal(str(d["goal_id"]))
	if e != nil {
		return nil, e
	}
	st, e := findStep(g, str(d["step_id"]))
	if e != nil {
		return nil, e
	}
	var yes bool
	e = q.tx.QueryRow(q.Context, "SELECT EXISTS(SELECT 1 FROM app.conversations WHERE id=$1 AND intern_id=$2 AND goal_id=$3 AND step_id=$4)", d["conversation_id"], q.user["id"], g["id"], st["id"]).Scan(&yes)
	if e != nil {
		return nil, e
	}
	if !yes {
		return nil, fail(404, "NOT_FOUND")
	}
	var unknown bool
	if e = q.tx.QueryRow(q.Context, "SELECT EXISTS(SELECT 1 FROM app.actions WHERE intern_id=$1 AND goal_id=$2 AND step_id=$3 AND type=$4 AND status IN ('executing','unknown'))", q.user["id"], g["id"], st["id"], d["type"]).Scan(&unknown); e != nil {
		return nil, e
	}
	if unknown {
		return nil, fail(409, "ACTION_NOT_PENDING")
	}
	if d["type"] == "create_access_request" {
		var outstanding bool
		if e = q.tx.QueryRow(q.Context, "SELECT EXISTS(SELECT 1 FROM app.access_requests WHERE intern_id=$1 AND resource_id=$2 AND status='submitted')", q.user["id"], g["resource_id"]).Scan(&outstanding); e != nil {
			return nil, e
		}
		if outstanding {
			return nil, fail(409, "ACTION_NOT_PENDING")
		}
	}
	params := clone(d["parameters"])
	preview := Object{}
	recipient := ""
	actionType := str(d["type"])
	if actionType == "create_access_request" {
		if st["id"] != "check_access" || !has(st["available_actions"], "create_access_request") {
			return nil, fail(422, "TOOL_VALIDATION_ERROR")
		}
		if params["resource_id"] != g["resource_id"] || !q.assigned(str(params["resource_id"])) {
			return nil, fail(404, "NOT_FOUND")
		}
		policy, e := q.one("SELECT to_jsonb(p) FROM app.resource_policies p WHERE resource_id=$1", g["resource_id"])
		if e != nil {
			return nil, e
		}
		if !has(policy["requestable_roles"], str(params["requested_role"])) {
			return nil, fail(422, "ROLE_NOT_REQUESTABLE")
		}
		recipient = str(policy["approver_id"])
		params["reason"] = clean(str(params["reason"]))
		preview = Object{"initiator_id": q.user["id"], "recipient_id": recipient, "resource_id": params["resource_id"], "requested_role": params["requested_role"], "reason": params["reason"]}
	} else {
		// v3 retired internal escalations: the intern writes to the mentor in Telegram.
		return nil, fail(422, "TOOL_VALIDATION_ERROR")
	}
	scope, e := q.scope(q.user)
	if e != nil {
		return nil, e
	}
	id := uuid()
	var runID any
	if run != "" {
		runID = run
	}
	if e = q.exec("INSERT INTO app.actions(id,intern_id,conversation_id,run_id,type,parameters,preview,status,expires_at,goal_id,step_id,goal_version,scope_hash,recipient_id) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'pending_confirmation',$8,$9,$10,$11,$12,$13)", id, q.user["id"], d["conversation_id"], runID, actionType, string(encode(params)), string(encode(preview)), q.s.Now().Add(10*time.Minute), g["id"], st["id"], g["version"], scope["policy_revision"], recipient); e != nil {
		return nil, e
	}
	return q.action(id)
}
func hasResource(user Object, resource string) bool {
	for _, v := range list(user["assignments"]) {
		if obj(v)["resource_id"] == resource {
			return true
		}
	}
	return false
}
func (q *request) actionRow(id string) (Object, error) {
	return q.one("SELECT to_jsonb(a)||jsonb_build_object('deadline',expires_at) FROM app.actions a WHERE id=$1 AND intern_id=$2 AND goal_id IS NOT NULL FOR UPDATE", id, q.user["id"])
}
func (q *request) action(id string) (Object, error) {
	return q.one("SELECT jsonb_strip_nulls(jsonb_build_object('id',id,'type',type,'goal_id',goal_id,'step_id',step_id,'parameters',parameters,'preview',preview,'expires_at',expires_at,'status',status,'result',result,'error_code',error_code,'created_at',created_at)) FROM app.actions WHERE id=$1 AND intern_id=$2", id, q.user["id"])
}
func getAction(q *request) (response, error) {
	a, e := q.actionRow(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if _, e = q.goalRow(str(a["goal_id"])); e != nil {
		return response{}, e
	}
	if a["status"] == "unknown" || a["status"] == "executing" {
		if e = q.reconcile(a); e != nil {
			return response{}, e
		}
	} else if a["status"] == "pending_confirmation" {
		expires, _ := time.Parse(time.RFC3339Nano, str(a["deadline"]))
		if !expires.After(q.s.Now()) {
			if e = q.exec("UPDATE app.actions SET status='expired' WHERE id=$1", a["id"]); e != nil {
				return response{}, e
			}
		}
	}
	v, e := q.action(str(a["id"]))
	return out("Action", v), e
}
func cancelAction(q *request) (response, error) {
	a, e := q.actionRow(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if a["status"] == "cancelled" {
		v, e := q.action(str(a["id"]))
		return out("Action", v), e
	}
	if a["status"] != "pending_confirmation" {
		return response{}, fail(409, "ACTION_NOT_PENDING")
	}
	expires, _ := time.Parse(time.RFC3339Nano, str(a["deadline"]))
	if !expires.After(q.s.Now()) {
		return q.expireAction(str(a["id"]), "ACTION_NOT_PENDING")
	}
	e = q.exec("UPDATE app.actions SET status='cancelled' WHERE id=$1", a["id"])
	if e != nil {
		return response{}, e
	}
	v, e := q.action(str(a["id"]))
	return out("Action", v), e
}
func confirmAction(q *request) (response, error) {
	a, e := q.actionRow(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if a["type"] == retiredAction && a["status"] == "pending_confirmation" {
		return q.retireAction(str(a["id"]))
	}
	g, e := q.goal(str(a["goal_id"]))
	if e != nil {
		return response{}, e
	}
	scope, e := q.scope(q.user)
	if e != nil {
		return response{}, e
	}
	if a["status"] == "executing" || a["status"] == "unknown" {
		if e = q.reconcile(a); e != nil {
			return response{}, e
		}
		v, e := q.action(str(a["id"]))
		return out("Action", v), e
	}
	if a["status"] == "succeeded" {
		v, e := q.action(str(a["id"]))
		return out("Action", v), e
	}
	if a["status"] != "pending_confirmation" {
		return response{}, fail(409, "ACTION_NOT_PENDING")
	}
	expires, _ := time.Parse(time.RFC3339Nano, str(a["deadline"]))
	if !expires.After(q.s.Now()) {
		return q.expireAction(str(a["id"]), "ACTION_EXPIRED")
	}
	if a["scope_hash"] != scope["policy_revision"] || num(a["goal_version"]) != num(g["version"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	var unknown bool
	if e = q.tx.QueryRow(q.Context, "SELECT EXISTS(SELECT 1 FROM app.actions WHERE intern_id=$1 AND goal_id=$2 AND step_id=$3 AND type=$4 AND id<>$5 AND status IN ('executing','unknown'))", q.user["id"], g["id"], a["step_id"], a["type"], a["id"]).Scan(&unknown); e != nil {
		return response{}, e
	}
	if unknown {
		return response{}, fail(409, "ACTION_NOT_PENDING")
	}
	params := obj(a["parameters"])
	policy, e := q.one("SELECT to_jsonb(p) FROM app.resource_policies p WHERE resource_id=$1", params["resource_id"])
	if e != nil {
		return response{}, e
	}
	if !has(policy["requestable_roles"], str(params["requested_role"])) || policy["approver_id"] != a["recipient_id"] {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	// The operation identity is durable before the first corporate mutation.
	if e = q.exec("UPDATE app.actions SET status='executing',updated_at=$2 WHERE id=$1", a["id"], q.s.Now()); e != nil {
		return response{}, e
	}
	if e = q.tx.Commit(q.Context); e != nil {
		return response{}, e
	}
	q.tx = nil
	record, callErr := q.upstream("POST", "/internal/v2/access-requests", "AccessRequestRecord", Object{"operation_key": a["id"], "subject_id": q.user["id"], "resource_id": params["resource_id"], "requested_role": params["requested_role"], "reason": params["reason"]})
	q.tx, e = q.s.Pool.Begin(q.Context)
	if e != nil {
		return response{}, e
	}
	if _, e = q.actionRow(str(a["id"])); e != nil {
		return response{}, e
	}
	if callErr != nil {
		e = q.exec("UPDATE app.actions SET status='unknown',error_code='UPSTREAM_TIMEOUT',updated_at=$2 WHERE id=$1 AND status='executing'", a["id"], q.s.Now())
	} else {
		e = q.saveRequest(a, record)
	}
	if e != nil {
		return response{}, e
	}
	v, e := q.action(str(a["id"]))
	return out("Action", v), e
}
func (q *request) saveRequest(a, record Object) error {
	if record["operation_key"] != a["id"] {
		return fail(502, "UPSTREAM_ERROR")
	}
	p := obj(a["parameters"])
	id := uuid()
	if e := q.exec("INSERT INTO app.access_requests(id,action_id,intern_id,resource,access_level,reason,mock_id,status,sync_status,goal_id,step_id,resource_id,requested_role,grant_state) VALUES ($1,$2,$3,$4,'read',$5,$6,$7,'ok',$8,$9,$4,$10,$11) ON CONFLICT (action_id) DO UPDATE SET status=EXCLUDED.status,grant_state=EXCLUDED.grant_state,sync_status='ok',updated_at=now()", id, a["id"], a["intern_id"], p["resource_id"], p["reason"], record["mock_id"], record["status"], a["goal_id"], a["step_id"], p["requested_role"], record["grant_state"]); e != nil {
		return e
	}
	if record["status"] == "submitted" {
		if e := q.event(str(a["id"]), "access_request_created", "mock_access_adapter", "access_request", id, str(a["id"]), Object{"request_id": id, "operation_key": a["id"], "resource_id": p["resource_id"], "status": "submitted"}); e != nil {
			return e
		}
	}
	var saved string
	if e := q.tx.QueryRow(q.Context, "SELECT id::text FROM app.access_requests WHERE action_id=$1", a["id"]).Scan(&saved); e != nil {
		return e
	}
	if e := q.exec("UPDATE app.actions SET status='succeeded',result=$2::jsonb,error_code=NULL,updated_at=$3 WHERE id=$1", a["id"], string(encode(Object{"access_request_id": saved})), q.s.Now()); e != nil {
		return e
	}
	if record["status"] == "submitted" {
		if e := q.exec("UPDATE app.step_progress SET state='waiting_external',version=version+1 WHERE goal_id=$1 AND step_id=$2 AND state<>'verified'", a["goal_id"], a["step_id"]); e != nil {
			return e
		}
		return q.exec("UPDATE app.goals SET status='waiting_external',version=version+1,updated_at=$2 WHERE id=$1 AND status<>'verified'", a["goal_id"], q.s.Now())
	}
	return nil
}
func (q *request) reconcile(a Object) error {
	if a["type"] != "create_access_request" {
		return nil
	}
	record, e := q.upstream("GET", "/internal/v2/access-requests/by-operation/"+str(a["id"]), "AccessRequestRecord", nil)
	var p problem
	if errors.As(e, &p) && p.status == 404 {
		scope, scopeErr := q.scope(q.user)
		expires, _ := time.Parse(time.RFC3339Nano, str(a["deadline"]))
		params := obj(a["parameters"])
		if scopeErr == nil && scope["policy_revision"] == a["scope_hash"] && q.assigned(str(params["resource_id"])) && has(q.user["roles"], "intern") && expires.After(q.s.Now()) {
			policy, policyErr := q.one("SELECT to_jsonb(p) FROM app.resource_policies p WHERE resource_id=$1", params["resource_id"])
			if policyErr == nil && has(policy["requestable_roles"], str(params["requested_role"])) && policy["approver_id"] == a["recipient_id"] {
				record, e = q.upstream("POST", "/internal/v2/access-requests", "AccessRequestRecord", Object{"operation_key": a["id"], "subject_id": a["intern_id"], "resource_id": params["resource_id"], "requested_role": params["requested_role"], "reason": params["reason"]})
			}
		}
	}
	if e != nil {
		return q.exec("UPDATE app.actions SET status='unknown',error_code='UPSTREAM_TIMEOUT' WHERE id=$1 AND status IN ('executing','unknown')", a["id"])
	}
	return q.saveRequest(a, record)
}

const accessJSON = `jsonb_build_object('id',a.id,'goal_id',a.goal_id,'step_id',a.step_id,'resource_id',a.resource_id,'requested_role',a.requested_role,'reason',a.reason,'mock_id',a.mock_id,'status',a.status,'grant_state',a.grant_state,'sync_status',a.sync_status,'version',a.version,'created_at',a.created_at,'updated_at',a.updated_at)`

func (q *request) allowedRequest(id string) (Object, error) {
	a, e := q.one("SELECT to_jsonb(a) FROM app.access_requests a WHERE id=$1 AND goal_id IS NOT NULL FOR UPDATE", id)
	if e != nil {
		return nil, e
	}
	allowed := a["intern_id"] == q.user["id"] && has(q.user["roles"], "intern") && q.assigned(str(a["resource_id"]))
	if has(q.user["roles"], "access_approver") && a["intern_id"] != q.user["id"] && q.assigned(str(a["resource_id"])) {
		var yes bool
		e = q.tx.QueryRow(q.Context, "SELECT EXISTS(SELECT 1 FROM app.resource_approvers WHERE resource_id=$1 AND user_id=$2)", a["resource_id"], q.user["id"]).Scan(&yes)
		if e != nil {
			return nil, e
		}
		allowed = allowed || yes
	}
	if !allowed {
		return nil, fail(404, "NOT_FOUND")
	}
	return a, nil
}
func (q *request) syncRequest(a Object) error {
	r, e := q.upstream("GET", "/internal/v2/access-requests/"+str(a["mock_id"]), "AccessRequestRecord", nil)
	if e != nil {
		return q.exec("UPDATE app.access_requests SET sync_status='unavailable',grant_state='unknown' WHERE id=$1", a["id"])
	}
	if r["mock_id"] != a["mock_id"] || r["operation_key"] != a["action_id"] {
		return fail(502, "UPSTREAM_ERROR")
	}
	key := uuid()
	grant, e := q.upstream("POST", "/internal/v2/iam/access-checks", "IamAccessCheckResult", Object{"check_id": key, "subject_id": a["intern_id"], "resource_id": a["resource_id"], "requested_role": a["requested_role"]})
	state, syncState := "unknown", "unavailable"
	if e == nil && grant["check_id"] == key && grant["subject_id"] == a["intern_id"] && grant["resource_id"] == a["resource_id"] {
		state, syncState = str(grant["grant_state"]), "ok"
	}
	return q.exec("UPDATE app.access_requests SET status=$2,grant_state=$3,sync_status=$4,version=version+CASE WHEN status<>$2 OR grant_state<>$3 THEN 1 ELSE 0 END,updated_at=CASE WHEN status<>$2 OR grant_state<>$3 THEN now() ELSE updated_at END WHERE id=$1", a["id"], r["status"], state, syncState)
}

func getAccessRequest(q *request) (response, error) {
	a, e := q.allowedRequest(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if e = q.syncRequest(a); e != nil {
		return response{}, e
	}
	v, e := q.one("SELECT "+accessJSON+" FROM app.access_requests a WHERE id=$1", a["id"])
	return out("AccessRequest", v), e
}
func listAccessRequests(q *request) (response, error) {
	rows, e := q.many("SELECT jsonb_build_object('id',id) FROM app.access_requests a WHERE goal_id IS NOT NULL AND (intern_id=$1 OR EXISTS(SELECT 1 FROM app.resource_approvers p WHERE p.user_id=$1 AND p.resource_id=a.resource_id)) ORDER BY created_at DESC LIMIT 100", q.user["id"])
	if e != nil {
		return response{}, e
	}
	items := []any{}
	for _, v := range rows {
		a, e := q.allowedRequest(str(obj(v)["id"]))
		if e != nil {
			continue
		}
		if e = q.syncRequest(a); e != nil {
			return response{}, e
		}
		p, e := q.one("SELECT "+accessJSON+" FROM app.access_requests a WHERE id=$1", a["id"])
		if e != nil {
			return response{}, e
		}
		items = append(items, p)
	}
	return out("AccessRequestList", Object{"items": items}), nil
}
func decideAccess(q *request) (response, error) {
	a, e := q.allowedRequest(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if a["intern_id"] == q.user["id"] {
		return response{}, fail(403, "FORBIDDEN")
	}
	if num(a["version"]) != num(q.body["expected_version"]) || a["status"] != "submitted" {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	r, e := q.upstream("POST", "/internal/v2/access-requests/"+str(a["mock_id"])+"/decision", "AccessRequestRecord", Object{"decision": q.body["decision"], "approver_id": q.user["id"], "reason": clean(str(q.body["reason"])), "operation_key": q.r.Header.Get("Idempotency-Key")})
	if e != nil {
		return response{}, e
	}
	if r["mock_id"] != a["mock_id"] || r["operation_key"] != a["action_id"] {
		return response{}, fail(502, "UPSTREAM_ERROR")
	}
	if e = q.syncRequest(a); e != nil {
		return response{}, e
	}
	kind := "access_request_approved"
	payload := Object{"request_id": a["id"], "decision_id": q.r.Header.Get("Idempotency-Key"), "approver_id": q.user["id"], "resource_id": a["resource_id"]}
	if q.body["decision"] == "rejected" {
		kind = "access_request_rejected"
		payload = Object{"request_id": a["id"], "decision_id": q.r.Header.Get("Idempotency-Key"), "safe_reason_code": "NOT_REQUESTABLE"}
	}
	if e = q.event(q.r.Header.Get("Idempotency-Key"), kind, "mock_access_adapter", "access_request", str(a["id"]), str(a["action_id"]), payload); e != nil {
		return response{}, e
	}
	if q.body["decision"] == "approved" {
		if e = q.recheckAfterApproval(a); e != nil {
			return response{}, e
		}
	}
	v, e := q.one("SELECT "+accessJSON+" FROM app.access_requests a WHERE id=$1", a["id"])
	return out("AccessRequest", v), e
}

// recheckAfterApproval: после одобрения Go сам повторяет IAM-проверку шага стажёра —
// так же, как кнопка «Повторить проверку». Шаг становится verified только по свежему
// ответу IAM (grant present), само одобрение доказательством не считается.
func (q *request) recheckAfterApproval(a Object) error {
	if str(a["step_id"]) != "check_access" {
		return nil
	}
	var grant string
	if e := q.tx.QueryRow(q.Context, "SELECT grant_state FROM app.access_requests WHERE id=$1", a["id"]).Scan(&grant); e != nil {
		return e
	}
	if grant != "present" {
		return nil
	}
	g, e := q.one("SELECT to_jsonb(g) FROM app.goals g WHERE id=$1 FOR UPDATE", a["goal_id"])
	if e != nil {
		return e
	}
	var state string
	if e = q.tx.QueryRow(q.Context, "SELECT state FROM app.step_progress WHERE goal_id=$1 AND step_id='check_access'", g["id"]).Scan(&state); e != nil {
		return e
	}
	if state == "verified" {
		return nil
	}
	t, e := q.template(g["journey_id"], g["journey_version"])
	if e != nil {
		return e
	}
	// Проверка идёт от имени стажёра: IAM спрашиваем про его доступ, friction — его команды.
	intern, e := q.one(userSQL, a["intern_id"])
	if e != nil {
		return e
	}
	approver := q.user
	q.user = intern
	_, e = q.performCheck(g, t, "check_access", Object{})
	q.user = approver
	// 409 — предыдущий шаг не проверен; performCheck отказал до записи, одобрение остаётся.
	var p problem
	if errors.As(e, &p) && p.status == 409 {
		return nil
	}
	return e
}

// Recover active streams after process restart. Unknown corporate writes reconcile by stable action ID.
func (s *Server) Recover(ctx context.Context) error {
	_, e := s.Pool.Exec(ctx, "UPDATE app.runs SET status='interrupted',error_code='CLIENT_DISCONNECTED',updated_at=now() WHERE status='running'; UPDATE app.messages SET status='interrupted' WHERE run_id IN (SELECT id FROM app.runs WHERE status='interrupted') AND role='assistant' AND status<>'completed'; UPDATE app.actions SET status='unknown',error_code='UPSTREAM_TIMEOUT' WHERE status='executing'")
	if e != nil {
		return e
	}
	if e = s.retireEscalations(ctx); e != nil {
		return e
	}
	// Enrichment that was running when the process stopped will not finish: keep the
	// deterministic text and say so instead of leaving the report pending forever.
	if _, e = s.Pool.Exec(ctx, "UPDATE app.task_clarity_reports SET enrichment_status='failed' WHERE enrichment_status='pending'"); e != nil {
		return e
	}
	return s.reconcilePending(ctx)
}
func (s *Server) reconcilePending(ctx context.Context) error {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	q := &request{Context: ctx, s: s, tx: tx, requestID: uuid()}
	rows, e := q.many("SELECT to_jsonb(a)||jsonb_build_object('deadline',expires_at) FROM app.actions a WHERE status='unknown' AND goal_id IS NOT NULL ORDER BY updated_at LIMIT 10 FOR UPDATE SKIP LOCKED")
	if e != nil {
		return e
	}
	for _, row := range rows {
		a := obj(row)
		q.user, e = q.one(userSQL, a["intern_id"])
		if e != nil {
			return e
		}
		if e = q.reconcile(a); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}

// Expiry is a durable server-clock transition even when the confirmation returns 409.
func (q *request) expireAction(id, code string) (response, error) {
	if e := q.exec("UPDATE app.actions SET status='expired',updated_at=$2 WHERE id=$1 AND status='pending_confirmation'", id, q.s.Now()); e != nil {
		return response{}, e
	}
	if e := q.tx.Commit(q.Context); e != nil {
		return response{}, e
	}
	q.tx = nil
	return response{}, fail(409, code)
}

// retiredAction is the v2 internal escalation. v3 replaces it with a Telegram link and a copy of
// the context; old escalations stay readable, new ones are never created or confirmed.
const retiredAction = "escalate_to_buddy"

// retireAction cancels a leftover pending escalation durably and refuses the confirmation.
func (q *request) retireAction(id string) (response, error) {
	if e := q.exec("UPDATE app.actions SET status='cancelled',updated_at=$2 WHERE id=$1 AND status='pending_confirmation'", id, q.s.Now()); e != nil {
		return response{}, e
	}
	if e := q.taskEvent("escalation_retired", "go_v3_migration", "action", id, Object{"action_id": id}); e != nil {
		return response{}, e
	}
	if e := q.tx.Commit(q.Context); e != nil {
		return response{}, e
	}
	q.tx = nil
	return response{}, fail(409, "ACTION_NOT_PENDING")
}

// retireEscalations cancels pending v2 escalations once at startup, with an audit event each.
func (s *Server) retireEscalations(ctx context.Context) error {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	q := &request{Context: ctx, s: s, tx: tx, requestID: uuid()}
	rows, e := q.many("SELECT jsonb_build_object('id',id) FROM app.actions WHERE type=$1 AND status='pending_confirmation' FOR UPDATE", retiredAction)
	if e != nil {
		return e
	}
	for _, row := range rows {
		id := str(obj(row)["id"])
		if e = q.exec("UPDATE app.actions SET status='cancelled',updated_at=now() WHERE id=$1", id); e != nil {
			return e
		}
		if e = q.taskEvent("escalation_retired", "go_v3_migration", "action", id, Object{"action_id": id}); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}
