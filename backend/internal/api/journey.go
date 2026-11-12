package api

import (
	"encoding/json"
	"strings"
	"time"
)

func (q *request) template(id any, version any) (Object, error) {
	row, e := q.one("SELECT jsonb_build_object('document',document,'hash',content_hash) FROM app.journey_templates WHERE journey_id=$1 AND version=$2", id, version)
	if e != nil {
		return nil, e
	}
	v := obj(row["document"])
	if q.s.Validate("journey/JourneyTemplate", v) != nil {
		return nil, fail(422, "TEMPLATE_INVALID")
	}
	unhashed := clone(v)
	delete(unhashed, "content_hash")
	if v["content_hash"] != row["hash"] || digest(encode(unhashed)) != row["hash"] {
		return nil, fail(422, "TEMPLATE_INVALID")
	}
	seen := map[string]bool{}
	for _, item := range list(v["steps"]) {
		step := obj(item)
		sid := str(step["id"])
		if seen[sid] {
			return nil, fail(422, "TEMPLATE_INVALID")
		}
		for _, d := range list(step["dependencies"]) {
			if !seen[str(obj(d)["step_id"])] {
				return nil, fail(422, "TEMPLATE_INVALID")
			}
		}
		seen[sid] = true
	}
	if v["team_id"] != q.user["team_id"] || !q.assigned(str(v["resource_id"])) {
		return nil, fail(404, "NOT_FOUND")
	}
	for _, st := range list(v["steps"]) {
		yes, e := q.canRead(str(obj(obj(st)["instruction_reference"])["document_id"]), q.user)
		if e != nil {
			return nil, e
		}
		if !yes {
			return nil, fail(404, "NOT_FOUND")
		}
	}
	return v, nil
}
func listJourneys(q *request) (response, error) {
	rows, e := q.many("SELECT jsonb_build_object('id',journey_id,'version',version) FROM app.journey_templates WHERE team_id=$1 ORDER BY journey_id,version DESC LIMIT 100", q.user["team_id"])
	if e != nil {
		return response{}, e
	}
	items := []any{}
	for _, r := range rows {
		t, e := q.template(obj(r)["id"], obj(r)["version"])
		if e != nil {
			continue
		}
		items = append(items, Object{"journey_id": t["journey_id"], "version": t["version"], "title": t["title"], "resource_id": t["resource_id"]})
	}
	return out("JourneyList", Object{"items": items}), nil
}
func createGoal(q *request) (response, error) {
	t, e := q.template(q.body["journey_id"], q.body["journey_version"])
	if e != nil {
		return response{}, e
	}
	if e = q.exec("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", str(q.user["id"])+str(t["journey_id"])); e != nil {
		return response{}, e
	}
	old, e := q.many("SELECT jsonb_build_object('id',id) FROM app.goals WHERE intern_id=$1 AND journey_id=$2 AND status<>'verified'", q.user["id"], t["journey_id"])
	if e != nil {
		return response{}, e
	}
	if len(old) > 0 {
		g, e := q.goal(str(obj(old[0])["id"]))
		return out("Goal", g), e
	}
	id := uuid()
	if e = q.exec("INSERT INTO app.goals(id,intern_id,journey_id,journey_version,content_hash,resource_id,status,version) VALUES ($1,$2,$3,$4,$5,$6,'ready',1)", id, q.user["id"], t["journey_id"], t["version"], t["content_hash"], t["resource_id"]); e != nil {
		return response{}, e
	}
	for _, v := range list(t["steps"]) {
		st := obj(v)
		state := "unverified"
		if len(list(st["dependencies"])) == 0 {
			state = "ready"
		}
		if e = q.exec("INSERT INTO app.step_progress(goal_id,step_id,state,version) VALUES ($1,$2,$3,1)", id, st["id"], state); e != nil {
			return response{}, e
		}
	}
	raw, e := q.goalRow(id)
	if e != nil {
		return response{}, e
	}
	for _, sid := range []string{"select_resource", "check_access"} {
		if _, e = q.performCheck(raw, t, sid, Object{}); e != nil {
			return response{}, e
		}
	}
	g, e := q.goal(id)
	return created("Goal", g), e
}
func (q *request) goalRow(id string) (Object, error) {
	g, e := q.one("SELECT to_jsonb(g) FROM app.goals g WHERE id=$1 AND intern_id=$2 FOR UPDATE", id, q.user["id"])
	if e != nil {
		return nil, e
	}
	if !q.assigned(str(g["resource_id"])) {
		return nil, fail(404, "NOT_FOUND")
	}
	return g, nil
}
func (q *request) goal(id string) (Object, error) {
	g, e := q.goalRow(id)
	if e != nil {
		return nil, e
	}
	t, e := q.template(g["journey_id"], g["journey_version"])
	if e != nil {
		return nil, e
	}
	if g["content_hash"] != t["content_hash"] {
		return nil, fail(422, "TEMPLATE_INVALID")
	}
	steps := []any{}
	var outstanding bool
	if e = q.tx.QueryRow(q.Context, "SELECT EXISTS(SELECT 1 FROM app.access_requests WHERE intern_id=$1 AND resource_id=$2 AND status='submitted')", q.user["id"], g["resource_id"]).Scan(&outstanding); e != nil {
		return nil, e
	}
	verified := 0
	for _, st := range list(t["steps"]) {
		s := clone(st)
		p, e := q.one("SELECT to_jsonb(s) FROM app.step_progress s WHERE goal_id=$1 AND step_id=$2", id, s["id"])
		if e != nil {
			return nil, e
		}
		s["status"] = p["state"]
		s["version"] = p["version"]
		if p["user_claim"] != nil {
			s["user_claim"] = p["user_claim"]
		}
		ev, e := q.many("SELECT jsonb_strip_nulls(jsonb_build_object('id',e.id,'check_id',e.check_id,'event_id',e.event_id,'source',e.source,'method',c.method,'result',e.result,'observed_at',e.observed_at,'invalidated_at',e.invalidated_at,'synthetic',true)) FROM app.evidence e JOIN app.verification_checks c ON c.id=e.check_id WHERE e.goal_id=$1 AND e.step_id=$2 ORDER BY e.observed_at DESC,c.created_at DESC,e.id DESC LIMIT 20", id, s["id"])
		if e != nil {
			return nil, e
		}
		s["evidence"] = ev
		blocks, e := q.many("SELECT jsonb_build_object('id',id,'type',blocker_type,'error_code',error_code,'status',status,'latest_check_id',latest_check_id,'recovery_actions',recovery_actions) FROM app.blockers WHERE goal_id=$1 AND step_id=$2 ORDER BY status,(SELECT created_at FROM app.verification_checks WHERE id=latest_check_id) DESC,id LIMIT 10", id, s["id"])
		if e != nil {
			return nil, e
		}
		s["blockers"] = blocks
		if s["status"] == "verified" {
			verified++
		}
		actions := []any{}
		if s["status"] != "unverified" && s["status"] != "verified" {
			for _, action := range list(s["available_actions"]) {
				if action == "create_access_request" && outstanding {
					continue
				}
				actions = append(actions, action)
			}
		}
		s["available_actions"] = actions
		steps = append(steps, s)
	}
	return Object{"id": id, "journey_id": g["journey_id"], "journey_version": g["journey_version"], "resource_id": g["resource_id"], "status": g["status"], "version": g["version"], "steps": steps, "progress": Object{"verified": verified, "total": len(steps), "percent": verified * 100 / len(steps)}, "updated_at": g["updated_at"]}, nil
}
func listGoals(q *request) (response, error) {
	rows, e := q.many("SELECT jsonb_build_object('id',id) FROM app.goals WHERE intern_id=$1 ORDER BY updated_at DESC LIMIT 100", q.user["id"])
	if e != nil {
		return response{}, e
	}
	items := []any{}
	for _, v := range rows {
		g, e := q.publicGoal(str(obj(v)["id"]))
		if e != nil {
			continue
		}
		items = append(items, g)
	}
	return out("GoalList", Object{"items": items}), nil
}
func getGoal(q *request) (response, error) {
	g, e := q.publicGoal(q.r.PathValue("id"))
	return out("Goal", g), e
}
func findStep(t Object, id string) (Object, error) {
	for _, v := range list(t["steps"]) {
		if obj(v)["id"] == id {
			return obj(v), nil
		}
	}
	return nil, fail(404, "NOT_FOUND")
}
func getStep(q *request) (response, error) {
	g, e := q.publicGoal(q.r.PathValue("goal"))
	if e != nil {
		return response{}, e
	}
	s, e := findStep(g, q.r.PathValue("step"))
	return out("Step", s), e
}
func stepActions(q *request) (response, error) {
	r, e := getStep(q)
	if e != nil {
		return response{}, e
	}
	return out("StepActionList", Object{"items": obj(r.body)["available_actions"]}), nil
}
func createCheck(q *request) (response, error) {
	g, e := q.goalRow(q.r.PathValue("goal"))
	if e != nil {
		return response{}, e
	}
	t, e := q.template(g["journey_id"], g["journey_version"])
	if e != nil {
		return response{}, e
	}
	step, e := findStep(t, q.r.PathValue("step"))
	if e != nil {
		return response{}, e
	}
	var version int
	if e = q.tx.QueryRow(q.Context, "SELECT version FROM app.step_progress WHERE goal_id=$1 AND step_id=$2", g["id"], step["id"]).Scan(&version); e != nil {
		return response{}, e
	}
	if version != num(q.body["expected_version"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	if step["verification_method"] != q.body["method"] {
		return response{}, fail(422, "VALIDATION_ERROR")
	}
	// Check the prerequisite's current IAM state before any DB probe; old evidence is not permission.
	if step["id"] == "check_connection" {
		var prior string
		if e = q.tx.QueryRow(q.Context, "SELECT state FROM app.step_progress WHERE goal_id=$1 AND step_id='check_access'", g["id"]).Scan(&prior); e != nil {
			return response{}, e
		}
		if prior != "verified" {
			return response{}, fail(409, "VERSION_CONFLICT")
		}
		if _, e = q.performCheck(g, t, "check_access", Object{}); e != nil {
			return response{}, e
		}
	}
	check, e := q.performCheck(g, t, str(step["id"]), obj(q.body["options"]), true)
	return created("Check", check), e
}
func getCheck(q *request) (response, error) {
	row, e := q.one("SELECT jsonb_build_object('goal',goal_id) FROM app.verification_checks WHERE id=$1", q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if _, e = q.goalRow(str(row["goal"])); e != nil {
		return response{}, e
	}
	v, e := q.check(q.r.PathValue("id"))
	return out("Check", v), e
}
func (q *request) check(id string) (Object, error) {
	return q.one("SELECT jsonb_strip_nulls(jsonb_build_object('id',c.id,'goal_id',c.goal_id,'step_id',c.step_id,'method',c.method,'status',c.status,'error_code',c.error_code,'observed_at',c.observed_at,'evidence_ids',COALESCE((SELECT jsonb_agg(id) FROM app.evidence WHERE check_id=c.id),'[]'))) FROM app.verification_checks c WHERE c.id=$1", id)
}
func getAccess(q *request) (response, error) {
	rid := q.r.PathValue("resource")
	if !q.assigned(rid) {
		return response{}, fail(404, "NOT_FOUND")
	}
	id := uuid()
	v, e := q.upstream("POST", "/internal/v2/iam/access-checks", "IamAccessCheckResult", Object{"check_id": id, "subject_id": q.user["id"], "resource_id": rid, "requested_role": "db_reader"})
	if e != nil {
		return out("ResourceAccess", Object{"grant_state": "unknown", "stale": true}), nil
	}
	if v["check_id"] != id || v["subject_id"] != q.user["id"] || v["resource_id"] != rid {
		return response{}, fail(502, "UPSTREAM_ERROR")
	}
	return out("ResourceAccess", Object{"grant_state": v["grant_state"], "stale": v["grant_state"] == "unknown", "observed_at": v["observed_at"]}), nil
}
func (q *request) performCheck(g, t Object, sid string, options Object, allowInvalidated ...bool) (Object, error) {
	step, e := findStep(t, sid)
	if e != nil {
		return nil, e
	}
	dependencyFailed := false
	for _, d := range list(step["dependencies"]) {
		var state string
		if e = q.tx.QueryRow(q.Context, "SELECT state FROM app.step_progress WHERE goal_id=$1 AND step_id=$2", g["id"], obj(d)["step_id"]).Scan(&state); e != nil {
			return nil, e
		}
		if state != "verified" {
			if len(allowInvalidated) == 0 {
				return nil, fail(409, "VERSION_CONFLICT")
			}
			dependencyFailed = true
		}
	}
	id, event, source, status, code, result := uuid(), uuid(), "go_policy", "passed", "", "passed"
	method := str(step["verification_method"])
	now := q.s.Now()
	observed := stamp(now)
	v := Object{}
	if method != "resource_policy_match" {
		path, def := "/internal/v2/iam/access-checks", "IamAccessCheckResult"
		input := Object{"check_id": id, "subject_id": q.user["id"], "resource_id": g["resource_id"], "requested_role": "db_reader"}
		source = "mock_iam_adapter"
		if method == "mock_db_connection" {
			path = "/internal/v2/db/connection-checks"
			def = "DbConnectionCheckResult"
			delete(input, "requested_role")
			input["options"] = options
			source = "mock_db_adapter"
		}
		if dependencyFailed {
			e = fail(502, "UPSTREAM_ERROR")
		} else {
			v, e = q.upstream("POST", path, def, input)
		}
		if e == nil {
			at, err := time.Parse(time.RFC3339Nano, str(v["observed_at"]))
			if err != nil || at.Before(now.Add(-time.Minute)) || at.After(now.Add(time.Minute)) || v["check_id"] != id || v["subject_id"] != q.user["id"] || v["resource_id"] != g["resource_id"] {
				e = fail(502, "UPSTREAM_ERROR")
			}
		}
		if e != nil {
			status, code, result = "unavailable", "CHECK_UNAVAILABLE", "failed"
		} else {
			event = str(v["event_id"])
			observed = str(v["observed_at"])
			if method == "iam_permission_present" {
				if v["grant_state"] == "unknown" {
					status, code, result = "unavailable", "CHECK_UNAVAILABLE", "failed"
				} else if v["grant_state"] != "present" {
					status, code, result = "failed", "ACCESS_MISSING", "absent"
				}
			} else {
				status = str(v["outcome"])
				code = str(v["error_code"])
				if status != "passed" {
					result = "failed"
				}
			}
		}
	}
	if e = q.exec("INSERT INTO app.verification_checks(id,goal_id,step_id,method,operation_key,status,error_code,observed_at,safe_options) VALUES ($1,$2,$3,$4,$1,$5,NULLIF($6,''),$7,$8::jsonb)", id, g["id"], sid, method, status, code, observed, string(encode(options))); e != nil {
		return nil, e
	}
	payload := Object{"check_id": id, "goal_id": g["id"], "step_id": sid}
	eventKind := ""
	if method == "resource_policy_match" {
		scope, err := q.scope(q.user)
		if err != nil {
			return nil, err
		}
		eventKind = "resource_policy_matched"
		payload["subject_id"] = q.user["id"]
		payload["resource_id"] = g["resource_id"]
		payload["policy_revision"] = scope["policy_revision"]
	} else if method == "iam_permission_present" && status != "unavailable" {
		eventKind = "resource_access_checked"
		payload["subject_id"] = q.user["id"]
		payload["resource_id"] = g["resource_id"]
		payload["grant_state"] = v["grant_state"]
	} else if method == "mock_db_connection" && status != "unavailable" {
		payload["safe_options"] = options
		if status == "passed" {
			eventKind = "db_connection_check_passed"
			payload["resource_id"] = g["resource_id"]
		} else {
			eventKind = "db_connection_check_failed"
			payload["error_code"] = code
		}
	}
	if eventKind != "" {
		if e = q.event(event, eventKind, source, "check", id, id, payload); e != nil {
			return nil, e
		}
	}
	if method == "iam_permission_present" && status == "passed" {
		if e = q.event(uuid(), "resource_access_granted", "mock_iam_adapter", "check", id, id, Object{"check_id": id, "subject_id": q.user["id"], "resource_id": g["resource_id"], "granted_role": "db_reader"}); e != nil {
			return nil, e
		}
	}
	evidence := []any{}
	if status != "unavailable" {
		eid := uuid()
		if e = q.exec("INSERT INTO app.evidence VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,true)", eid, id, event, source, q.user["id"], g["resource_id"], g["id"], sid, g["journey_version"], result, observed); e != nil {
			return nil, e
		}
		evidence = append(evidence, eid)
	}
	state := "verified"
	if status != "passed" {
		state = "blocked"
	}
	if e = q.exec("UPDATE app.evidence SET invalidated_at=$3 WHERE goal_id=$1 AND step_id=$2 AND check_id<>$4 AND invalidated_at IS NULL", g["id"], sid, now, id); e != nil {
		return nil, e
	}
	if status == "passed" {
		if e = q.exec("UPDATE app.blockers SET status='resolved' WHERE goal_id=$1 AND step_id=$2 AND status='open'", g["id"], sid); e != nil {
			return nil, e
		}
	}
	blocks := []any{}
	if code != "" {
		bid := uuid()
		kind := strings.ToLower(code)
		actions := []any{"retry_check"}
		if code == "DB_SSL_REQUIRED" {
			actions = append(actions, "escalate_to_buddy")
		} else if code == "CHECK_UNAVAILABLE" {
			kind = "check_unavailable"
		} else if sid == "check_access" {
			actions = append(actions, "create_access_request")
		}
		var raw []byte
		if e = q.tx.QueryRow(q.Context, "INSERT INTO app.blockers VALUES ($1,$2,$3,$4,$5,'open',$6,$7::jsonb) ON CONFLICT (goal_id,step_id,error_code) WHERE status='open' DO UPDATE SET latest_check_id=EXCLUDED.latest_check_id RETURNING to_jsonb(blockers)", bid, g["id"], sid, kind, code, id, string(encode(actions))).Scan(&raw); e != nil {
			return nil, e
		}
		var existing Object
		_ = json.Unmarshal(raw, &existing)
		bid = str(existing["id"])
		if e = q.event(uuid(), "blocker_detected", "go_policy", "blocker", bid, id, Object{"blocker_id": bid, "goal_id": g["id"], "step_id": sid, "blocker_type": kind, "error_code": code, "check_id": id}); e != nil {
			return nil, e
		}
		blocks = append(blocks, bid)
		if e = q.friction(g, step, id, code, kind, status); e != nil {
			return nil, e
		}
	}
	var activeBlocks []byte
	if e = q.tx.QueryRow(q.Context, "SELECT COALESCE(jsonb_agg(id ORDER BY id),'[]') FROM app.blockers WHERE goal_id=$1 AND step_id=$2 AND status='open'", g["id"], sid).Scan(&activeBlocks); e != nil {
		return nil, e
	}
	if e = json.Unmarshal(activeBlocks, &blocks); e != nil {
		return nil, e
	}
	if e = q.exec("UPDATE app.step_progress SET state=$3,version=version+1,evidence_ids=$4::jsonb,blocker_ids=$5::jsonb WHERE goal_id=$1 AND step_id=$2", g["id"], sid, state, string(encode(evidence)), string(encode(blocks))); e != nil {
		return nil, e
	}
	// Propagate invalidation through the deterministic DAG, never through model text.
	for _, item := range list(t["steps"]) {
		child := obj(item)
		if child["id"] == sid {
			continue
		}
		depends := false
		ready := true
		for _, d := range list(child["dependencies"]) {
			dep := obj(d)["step_id"]
			if dep == sid {
				depends = true
			}
			var current string
			if e = q.tx.QueryRow(q.Context, "SELECT state FROM app.step_progress WHERE goal_id=$1 AND step_id=$2", g["id"], dep).Scan(&current); e != nil {
				return nil, e
			}
			if current != "verified" {
				ready = false
			}
		}
		if !ready {
			if e = q.exec("UPDATE app.step_progress SET state='unverified',evidence_ids='[]',version=version+1 WHERE goal_id=$1 AND step_id=$2 AND state<>'unverified'", g["id"], child["id"]); e != nil {
				return nil, e
			}
			if e = q.exec("UPDATE app.evidence SET invalidated_at=$3 WHERE goal_id=$1 AND step_id=$2 AND invalidated_at IS NULL", g["id"], child["id"], now); e != nil {
				return nil, e
			}
		} else if depends {
			if e = q.exec("UPDATE app.step_progress SET state=CASE WHEN EXISTS(SELECT 1 FROM app.blockers WHERE goal_id=$1 AND step_id=$2 AND status='open') THEN 'blocked' ELSE 'ready' END,version=version+1 WHERE goal_id=$1 AND step_id=$2 AND state='unverified'", g["id"], child["id"]); e != nil {
				return nil, e
			}
		}
	}
	if e = q.exec("UPDATE app.goals SET version=version+1,updated_at=$2,status=CASE WHEN NOT EXISTS(SELECT 1 FROM app.step_progress WHERE goal_id=$1 AND state<>'verified') THEN 'verified' WHEN EXISTS(SELECT 1 FROM app.step_progress WHERE goal_id=$1 AND state='blocked') THEN 'blocked' WHEN EXISTS(SELECT 1 FROM app.step_progress WHERE goal_id=$1 AND state='waiting_external') THEN 'waiting_external' ELSE 'ready' END WHERE id=$1", g["id"], now); e != nil {
		return nil, e
	}
	return q.check(id)
}

// Polling never promotes a step. A fresh read can invalidate previously verified IAM evidence.
func (q *request) publicGoal(id string) (Object, error) {
	g, e := q.goal(id)
	if e != nil {
		return nil, e
	}
	st, e := findStep(g, "check_access")
	if e != nil {
		return nil, e
	}
	if st["status"] != "verified" {
		return g, nil
	}
	checkID := uuid()
	v, e := q.upstream("POST", "/internal/v2/iam/access-checks", "IamAccessCheckResult", Object{"check_id": checkID, "subject_id": q.user["id"], "resource_id": g["resource_id"], "requested_role": "db_reader"})
	if e == nil && v["check_id"] == checkID && v["subject_id"] == q.user["id"] && v["resource_id"] == g["resource_id"] && v["grant_state"] == "present" {
		at, err := time.Parse(time.RFC3339Nano, str(v["observed_at"]))
		if err == nil && at.After(q.s.Now().Add(-time.Minute)) && at.Before(q.s.Now().Add(time.Minute)) {
			return g, nil
		}
	}
	t, e := q.template(g["journey_id"], g["journey_version"])
	if e != nil {
		return nil, e
	}
	if _, e = q.performCheck(g, t, "check_access", Object{}); e != nil {
		return nil, e
	}
	return q.goal(id)
}
