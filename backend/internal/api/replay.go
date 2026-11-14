package api

// Idempotency preserves the operation result, never the caller's historical permissions.
func (q *request) authorizeReplay(pattern string, value any) error {
	v := obj(value)
	switch pattern {
	case "POST /api/v4/workspaces/{id}/link-confirm":
		if _, _, _, e := q.workspaceView(q.r.PathValue("id")); e != nil {
			return e
		}
		goal := str(obj(obj(v["card"])["goal"])["id"])
		if goal != "" && !q.goalVisible(goal) {
			return fail(404, "NOT_FOUND")
		}
		return nil
	case "POST /api/v4/task-clarity-reports/{id}/revision-proposals", "POST /api/v4/revision-proposals/{id}/apply":
		_, e := q.proposal(str(v["id"]))
		return e
	case "POST /api/v4/task-briefs/{id}/impact-config":
		_, e := q.brief(q.r.PathValue("id"))
		return e

	case "POST /api/v2/goals/{goal}/steps/{step}/checks":
		_, e := q.goal(str(v["goal_id"]))
		return e
	case "POST /api/v2/goals":
		_, e := q.goal(str(v["id"]))
		return e
	case "POST /api/v2/conversations":
		_, e := q.conversation(str(v["id"]))
		return e
	case "POST /api/v2/conversations/{id}/runs":
		_, e := q.run(str(v["id"]))
		return e
	case "POST /api/v2/actions":
		a, e := q.actionRow(str(v["id"]))
		if e != nil {
			return e
		}
		if _, e = q.goal(str(a["goal_id"])); e != nil {
			return e
		}
		scope, e := q.scope(q.user)
		if e != nil {
			return e
		}
		if a["scope_hash"] != scope["policy_revision"] {
			return fail(404, "NOT_FOUND")
		}
		return nil
	case "POST /api/v2/access-requests/{id}/decision":
		a, e := q.allowedRequest(q.r.PathValue("id"))
		if e != nil {
			return e
		}
		if a["intern_id"] == q.user["id"] {
			return fail(403, "FORBIDDEN")
		}
		return nil
	case "POST /api/v2/knowledge-gaps/{id}/review":
		_, e := q.candidate(q.r.PathValue("id"))
		return e
	case "POST /api/v3/task-briefs":
		_, e := q.brief(str(v["id"]))
		return e
	case "POST /api/v3/task-assignments":
		a, e := q.assignment(str(v["id"]))
		if e != nil {
			return e
		}
		if a["owner_id"] != q.user["id"] {
			return fail(404, "NOT_FOUND")
		}
		return nil
	case "POST /api/v3/task-assignments/{id}/frictions":
		a, e := q.assignment(q.r.PathValue("id"))
		if e != nil {
			return e
		}
		if a["viewer_is_intern"] != true {
			return fail(404, "NOT_FOUND")
		}
		return nil
	case "POST /api/v3/task-clarity-reports/{id}/review":
		_, e := q.report(q.r.PathValue("id"))
		return e
	default:
		return fail(403, "FORBIDDEN")
	}
}
