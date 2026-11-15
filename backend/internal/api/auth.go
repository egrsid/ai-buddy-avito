package api

import (
	"net/http"
)

const userSQL = `SELECT jsonb_build_object('id',u.id,'account_id',u.account_id,'display_name',u.display_name,
 'team_id',u.team,'buddy_id',u.buddy_id,'policy_revision',u.policy_revision,
 'roles',COALESCE((SELECT jsonb_agg(role ORDER BY role) FROM app.role_assignments WHERE user_id=u.id),'[]'),
 'assignments',COALESCE((SELECT jsonb_agg(jsonb_build_object('resource_id',resource_id,'role',requested_role) ORDER BY resource_id) FROM app.resource_assignments WHERE user_id=u.id),'[]'))
 FROM app.users u WHERE u.id=$1`

func publicUser(u Object) Object {
	v := clone(u)
	delete(v, "csrf_token")
	delete(v, "policy_revision")
	return v
}
func (q *request) authenticate() (Object, error) {
	cookie, e := q.r.Cookie("buddy_session")
	if e != nil {
		return nil, fail(401, "UNAUTHENTICATED")
	}
	var id, csrf string
	e = q.tx.QueryRow(q.Context, "SELECT user_id::text,csrf_token FROM app.sessions WHERE token_hash=$1 AND expires_at>$2", digest([]byte(cookie.Value)), q.s.Now()).Scan(&id, &csrf)
	if e != nil {
		return nil, fail(401, "UNAUTHENTICATED")
	}
	u, e := q.one(userSQL, id)
	if e != nil {
		return nil, fail(401, "UNAUTHENTICATED")
	}
	if len(list(u["roles"])) == 0 {
		return nil, fail(403, "FORBIDDEN")
	}
	u["csrf_token"] = csrf
	return u, nil
}
func login(q *request) (response, error) {
	if q.s.Config.Env != "local" && q.s.Config.Env != "test" {
		return response{}, fail(403, "FORBIDDEN")
	}
	var id string
	if e := q.tx.QueryRow(q.Context, "SELECT id::text FROM app.users WHERE account_id=$1", q.body["account_id"]).Scan(&id); e != nil {
		return response{}, fail(401, "UNAUTHENTICATED")
	}
	u, e := q.one(userSQL, id)
	if e != nil {
		return response{}, e
	}
	if len(list(u["roles"])) == 0 {
		return response{}, fail(403, "FORBIDDEN")
	}
	if e = q.exec("DELETE FROM app.sessions WHERE user_id=$1", id); e != nil {
		return response{}, e
	}
	token, csrf := randomToken(), randomToken()
	e = q.exec("INSERT INTO app.sessions VALUES ($1,$2,$3,$4)", digest([]byte(token)), id, csrf, q.s.Now().Add(8*60*60*1e9))
	if e != nil {
		return response{}, e
	}
	session := Object{"user": publicUser(u), "csrf_token": csrf}
	if q.s.Validate("public/AuthSession", session) != nil {
		return response{}, fail(502, "UPSTREAM_ERROR")
	}
	session["_cookie"] = token
	return response{200, session, ""}, nil
}
func authMe(q *request) (response, error) {
	return out("AuthSession", Object{"user": publicUser(q.user), "csrf_token": q.user["csrf_token"]}), nil
}
func logout(q *request) (response, error) {
	cookie, _ := q.r.Cookie("buddy_session")
	e := q.exec("DELETE FROM app.sessions WHERE token_hash=$1", digest([]byte(cookie.Value)))
	return response{204, nil, ""}, e
}
func (q *request) assigned(resource string) bool {
	for _, v := range list(q.user["assignments"]) {
		if obj(v)["resource_id"] == resource {
			return true
		}
	}
	return false
}
func (q *request) scope(u Object) (Object, error) {
	resources := []any{}
	for _, v := range list(u["assignments"]) {
		perms := []any{"resource.view", "knowledge.read"}
		if has(u["roles"], "intern") {
			perms = append(perms, "access.request", "access.check", "db.check")
		}
		if has(u["roles"], "access_approver") {
			var yes bool
			e := q.tx.QueryRow(q.Context, "SELECT EXISTS(SELECT 1 FROM app.resource_approvers WHERE resource_id=$1 AND user_id=$2)", obj(v)["resource_id"], u["id"]).Scan(&yes)
			if e != nil {
				return nil, e
			}
			if yes {
				perms = append(perms, "access.approve")
			}
		}
		resources = append(resources, Object{"resource_id": obj(v)["resource_id"], "permissions": perms})
	}
	docs, e := q.many("SELECT jsonb_build_object('document_id',document_id,'permissions',jsonb_agg(permission ORDER BY permission)) FROM app.document_permissions WHERE subject_id=$1 GROUP BY document_id ORDER BY document_id", u["id"])
	if e != nil {
		return nil, e
	}
	scope := Object{"subject_id": u["id"], "team_ids": []any{u["team_id"]}, "resource_permissions": resources, "document_permissions": docs}
	scope["policy_revision"] = digest(encode(Object{"scope": scope, "revision": u["policy_revision"], "buddy_id": u["buddy_id"], "roles": u["roles"]}))
	if q.s.Validate("common/AccessScope", scope) != nil {
		return nil, fail(403, "FORBIDDEN")
	}
	return scope, nil
}
func (q *request) canRead(document string, u Object) (bool, error) {
	var yes bool
	e := q.tx.QueryRow(q.Context, "SELECT EXISTS(SELECT 1 FROM app.document_permissions WHERE subject_id=$1 AND document_id=$2 AND permission='knowledge.read')", u["id"], document).Scan(&yes)
	return yes, e
}
func (q *request) canReview(refs any) bool {
	for _, ref := range list(refs) {
		var yes bool
		e := q.tx.QueryRow(q.Context, "SELECT count(DISTINCT permission)=2 FROM app.document_permissions WHERE subject_id=$1 AND document_id=$2 AND permission IN ('knowledge_gap.review','knowledge.read')", q.user["id"], obj(ref)["document_id"]).Scan(&yes)
		if e != nil || !yes {
			return false
		}
	}
	return len(list(refs)) > 0
}
func listResources(q *request) (response, error) {
	items, e := q.many("SELECT jsonb_build_object('resource_id',resource_id,'title',title,'requestable_roles',requestable_roles,'synthetic',true) FROM app.resource_policies WHERE resource_id IN (SELECT resource_id FROM app.resource_assignments WHERE user_id=$1) ORDER BY resource_id LIMIT 100", q.user["id"])
	return out("ResourceList", Object{"items": items}), e
}
func (s *Server) routes(m *http.ServeMux) {
	s.route(m, "POST /api/v2/auth/demo-login", "DemoLoginRequest", "", false, login)
	s.route(m, "GET /api/v2/auth/me", "", "", false, authMe)
	s.route(m, "POST /api/v2/auth/logout", "EmptyBody", "", false, logout)
	s.route(m, "GET /api/v2/resources", "", "", false, listResources)
	s.route(m, "GET /api/v2/journeys", "", "intern", false, listJourneys)
	s.route(m, "POST /api/v2/goals", "GoalCreateRequest", "intern", true, createGoal)
	s.route(m, "GET /api/v2/goals", "", "intern", false, listGoals)
	s.route(m, "GET /api/v2/goals/{id}", "", "intern", false, getGoal)
	s.route(m, "GET /api/v2/goals/{goal}/steps/{step}", "", "intern", false, getStep)
	s.route(m, "GET /api/v2/goals/{goal}/steps/{step}/actions", "", "intern", false, stepActions)
	s.route(m, "POST /api/v2/goals/{goal}/steps/{step}/checks", "CheckCreateRequest", "intern", true, createCheck)
	s.route(m, "GET /api/v2/checks/{id}", "", "intern", false, getCheck)
	s.route(m, "GET /api/v2/resources/{resource}/access", "", "intern", false, getAccess)
	s.actionRoutes(m)
	s.chatRoutes(m)
	s.feedbackRoutes(m)
	s.contactRoutes(m)
	s.taskRoutes(m)
	s.goalRoutes(m)
	s.statisticsRoutes(m)
	s.v4Routes(m)
}
