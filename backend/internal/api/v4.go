package api

import (
	"fmt"
	"net/http"
	"time"
)

func out4(def string, v any) response     { return response{200, v, "v4/public/" + def} }
func created4(def string, v any) response { return response{201, v, "v4/public/" + def} }

func (s *Server) v4Routes(m *http.ServeMux) {
	s.route(m, "GET /api/v4/workspaces", "", "intern", false, listWorkspaces)
	s.route(m, "GET /api/v4/workspaces/{id}", "", "intern", false, getWorkspace)
	s.route(m, "POST /api/v4/assignments/{id}/permitted-template", "v4/public/PermittedTemplateRequest", "buddy", false, setPermittedTemplate)
	s.route(m, "POST /api/v4/workspaces/{id}/link-preview", "v4/public/LinkPreviewRequest", "intern", false, linkPreview)
	s.route(m, "POST /api/v4/workspaces/{id}/link-confirm", "v4/public/LinkConfirmRequest", "intern", true, linkConfirm)
	s.route(m, "GET /api/v4/goals/{id}/evidence-timeline", "", "intern", false, evidenceTimeline)
	s.route(m, "POST /api/v4/task-clarity-reports/{id}/revision-proposals", "v4/public/RevisionProposalRequest", "buddy", true, createRevisionProposal)
	s.route(m, "GET /api/v4/revision-proposals/{id}", "", "buddy", false, getRevisionProposal)
	s.route(m, "POST /api/v4/revision-proposals/{id}/apply", "v4/public/RevisionApplyRequest", "buddy", true, applyRevision)
	s.route(m, "POST /api/v4/revision-proposals/{id}/discard", "v4/public/RevisionDiscardRequest", "buddy", false, discardRevision)
	s.route(m, "POST /api/v4/task-briefs/{id}/impact-config", "v4/public/ImpactConfigRequest", "buddy", true, saveImpactConfig)
	s.route(m, "GET /api/v4/task-briefs/{id}/impact", "", "buddy", false, getImpact)
}

func (q *request) openExposure(assignmentID, internID, briefID string, version int, source string) error {
	if e := q.closeExposure(assignmentID, source); e != nil {
		return e
	}
	return q.exec("INSERT INTO app.version_exposure_episodes(id,intern_id,assignment_id,brief_id,version,source,started_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", uuid(), internID, assignmentID, briefID, version, source, q.s.Now())
}

func (q *request) closeExposure(assignmentID, reason string) error {
	return q.exec("UPDATE app.version_exposure_episodes SET ended_at=$3, end_reason=$2 WHERE assignment_id=$1 AND ended_at IS NULL", assignmentID, reason, q.s.Now())
}

func listWorkspaces(q *request) (response, error) {
	rows, e := q.many("SELECT jsonb_build_object('id',id) FROM app.task_assignments WHERE intern_id=$1 ORDER BY created_at,id LIMIT 20", q.user["id"])
	if e != nil {
		return response{}, e
	}
	items := []any{}
	for _, row := range rows {
		card, err := q.workspaceCard(str(obj(row)["id"]))
		if err != nil {
			return response{}, err
		}
		items = append(items, card)
	}
	goals, e := q.many("SELECT jsonb_build_object('id',g.id,'title',COALESCE(NULLIF(t.document->>'title',''), g.journey_id),'status',g.status) FROM app.goals g JOIN app.journey_templates t ON t.journey_id=g.journey_id AND t.version=g.journey_version WHERE g.intern_id=$1 AND NOT EXISTS (SELECT 1 FROM app.workspace_links l WHERE l.goal_id=g.id AND l.active) ORDER BY g.created_at,g.id LIMIT 20", q.user["id"])
	if e != nil {
		return response{}, e
	}
	unlinked := []any{}
	for _, row := range goals {
		g := obj(row)
		if !q.goalVisible(str(g["id"])) {
			continue
		}
		unlinked = append(unlinked, Object{
			"kind": "goal", "id": g["id"], "title": g["title"], "link_status": "unlinked",
			"technical_status": technicalStatus(str(g["status"])), "next_action": nextAction(str(g["status"]), false),
			"goal": Object{"status": schemaStatus(str(g["status"])), "id": g["id"], "title": g["title"]},
		})
	}
	if items == nil {
		items = []any{}
	}
	return out4("WorkspaceList", Object{"items": items, "unlinked_goals": unlinked, "as_of": stamp(q.s.Now())}), nil
}

func getWorkspace(q *request) (response, error) {
	card, revision, status, e := q.workspaceView(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	return out4("Workspace", Object{"assignment_id": q.r.PathValue("id"), "revision": revision, "link_status": status, "card": card}), nil
}

func (q *request) workspaceCard(id string) (Object, error) {
	card, _, _, e := q.workspaceView(id)
	return card, e
}

func (q *request) workspaceView(id string) (Object, int, string, error) {
	a, e := q.assignment(id)
	if e != nil {
		return nil, 0, "", e
	}
	if a["viewer_is_intern"] != true {
		return nil, 0, "", fail(404, "NOT_FOUND")
	}
	title := str(obj(a["content"])["title"])
	if title == "" {
		title = "Задание"
	}
	link, e := q.many("SELECT jsonb_build_object('goal_id',goal_id,'active',active) FROM app.workspace_links WHERE assignment_id=$1 AND active ORDER BY created_at DESC LIMIT 1", id)
	if e != nil {
		return nil, 0, "", e
	}
	status := "unlinked"
	goal := Object{"status": "unlinked"}
	technical := "unknown"
	action := "confirm_link"
	var blocker string
	if len(link) > 0 {
		goalID := str(obj(link[0])["goal_id"])
		row, err := q.one("SELECT jsonb_build_object('id',g.id,'status',g.status,'title',t.document->>'title','resource_id',g.resource_id) FROM app.goals g JOIN app.journey_templates t ON t.journey_id=g.journey_id AND t.version=g.journey_version WHERE g.id=$1 AND g.intern_id=$2", goalID, q.user["id"])
		if err != nil {
			return nil, 0, "", err
		}
		if !q.assigned(str(row["resource_id"])) {
			status = "unavailable"
			goal = Object{"status": "unavailable"}
			technical = "unknown"
			action = "unavailable"
		} else {
			status = "linked"
			technical = technicalStatus(str(row["status"]))
			action = nextAction(str(row["status"]), true)
			goal = Object{"status": schemaStatus(str(row["status"])), "id": row["id"], "title": row["title"]}
			code, err := q.openBlocker(goalID)
			if err != nil {
				return nil, 0, "", err
			}
			blocker = code
		}
	}
	card := Object{
		"kind": "assignment", "id": a["id"], "title": title, "link_status": status,
		"technical_status": technical, "next_action": action, "goal": goal,
	}
	if blocker != "" {
		card["blocker_code"] = blocker
	}
	return card, num(a["revision"]), status, nil
}

func (q *request) goalVisible(id string) bool {
	row, e := q.one("SELECT jsonb_build_object('resource_id',resource_id) FROM app.goals WHERE id=$1 AND intern_id=$2", id, q.user["id"])
	return e == nil && q.assigned(str(row["resource_id"]))
}

func (q *request) openBlocker(goalID string) (string, error) {
	rows, e := q.many("SELECT jsonb_build_object('error_code',error_code) FROM app.blockers WHERE goal_id=$1 AND status='open' ORDER BY error_code LIMIT 1", goalID)
	if e != nil || len(rows) == 0 {
		return "", e
	}
	return str(obj(rows[0])["error_code"]), nil
}

func schemaStatus(status string) string {
	switch status {
	case "verified", "blocked", "ready", "unverified":
		return status
	default:
		return "unverified"
	}
}

func technicalStatus(status string) string {
	switch status {
	case "verified", "blocked", "ready", "unverified":
		return status
	default:
		return "unknown"
	}
}

func nextAction(status string, linked bool) string {
	if !linked {
		return "confirm_link"
	}
	switch status {
	case "verified":
		return "done"
	case "blocked":
		return "resolve_blocker"
	default:
		return "continue"
	}
}

func setPermittedTemplate(q *request) (response, error) {
	a, e := q.assignment(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if a["viewer_is_intern"] == true || num(a["revision"]) != num(q.body["expected_revision"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	if _, e = q.template(q.body["template_id"], q.body["template_version"]); e != nil {
		return response{}, e
	}
	if e = q.exec("UPDATE app.task_assignments SET permitted_template_id=$2, permitted_template_version=$3, revision=revision+1, updated_at=$4 WHERE id=$1", a["id"], q.body["template_id"], q.body["template_version"], q.s.Now()); e != nil {
		return response{}, e
	}
	return out4("Workspace", Object{
		"assignment_id": a["id"], "revision": num(a["revision"]) + 1, "link_status": "unlinked",
		"card": Object{
			"kind": "assignment", "id": a["id"], "title": briefTitle(a), "link_status": "unlinked",
			"technical_status": "unknown", "next_action": "confirm_link", "goal": Object{"status": "unlinked"},
		},
	}), nil
}

func briefTitle(a Object) string {
	if title := str(obj(a["content"])["title"]); title != "" {
		return title
	}
	return "Задание"
}

func linkPreview(q *request) (response, error) {
	a, e := q.assignment(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if a["viewer_is_intern"] != true {
		return response{}, fail(404, "NOT_FOUND")
	}
	if str(a["permitted_template_id"]) == "" || str(a["permitted_template_id"]) != str(q.body["template_id"]) || num(a["permitted_template_version"]) != num(q.body["template_version"]) {
		return response{}, fail(422, "VALIDATION_ERROR")
	}
	if _, e = q.template(q.body["template_id"], q.body["template_version"]); e != nil {
		return response{}, e
	}
	hash := digest([]byte(fmt.Sprintf("%s|%s|%d|%d", str(a["id"]), str(q.body["template_id"]), num(q.body["template_version"]), num(a["revision"]))))
	id := uuid()
	expires := q.s.Now().UTC().Add(10 * time.Minute)
	if e = q.exec("INSERT INTO app.workspace_link_previews(id,assignment_id,intern_id,template_id,template_version,preview_hash,assignment_revision,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", id, a["id"], q.user["id"], q.body["template_id"], q.body["template_version"], hash, a["revision"], expires); e != nil {
		return response{}, e
	}
	return created4("LinkPreview", Object{
		"id": id, "assignment_id": a["id"], "template_id": q.body["template_id"], "template_version": q.body["template_version"],
		"preview_hash": hash, "expires_at": stamp(expires), "assignment_revision": num(a["revision"]),
	}), nil
}

func linkConfirm(q *request) (response, error) {
	a, e := q.assignment(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if a["viewer_is_intern"] != true {
		return response{}, fail(404, "NOT_FOUND")
	}
	if num(a["revision"]) != num(q.body["expected_revision"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	preview, e := q.one("SELECT to_jsonb(p) FROM app.workspace_link_previews p WHERE id=$1 AND assignment_id=$2 AND intern_id=$3", q.body["preview_id"], a["id"], q.user["id"])
	if e != nil {
		return response{}, e
	}
	expires, err := time.Parse(time.RFC3339, str(preview["expires_at"]))
	if err != nil || !q.s.Now().Before(expires) || str(preview["preview_hash"]) != str(q.body["preview_hash"]) || num(preview["assignment_revision"]) != num(a["revision"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	active, e := q.many("SELECT jsonb_build_object('id',id) FROM app.workspace_links WHERE assignment_id=$1 AND active", a["id"])
	if e != nil {
		return response{}, e
	}
	if len(active) > 0 {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	goalID, e := q.ownGoal(str(preview["template_id"]), num(preview["template_version"]))
	if e != nil {
		return response{}, e
	}
	if e = q.exec("INSERT INTO app.workspace_links(id,assignment_id,goal_id,created_by) VALUES ($1,$2,$3,$4)", uuid(), a["id"], goalID, q.user["id"]); e != nil {
		return response{}, e
	}
	if e = q.exec("UPDATE app.task_assignments SET revision=revision+1, updated_at=$2 WHERE id=$1", a["id"], q.s.Now()); e != nil {
		return response{}, e
	}
	if e = q.exec("INSERT INTO app.business_events VALUES ($1,'workspace_linked',1,$2,'go_v4','goal',$3,$4,$5::jsonb,true)", uuid(), q.s.Now(), goalID, q.requestID, string(encode(Object{"assignment_id": a["id"]}))); e != nil {
		return response{}, e
	}
	return getWorkspace(q)
}

func (q *request) ownGoal(templateID string, version int) (string, error) {
	rows, e := q.many("SELECT jsonb_build_object('id',id) FROM app.goals WHERE intern_id=$1 AND journey_id=$2 ORDER BY created_at LIMIT 1", q.user["id"], templateID)
	if e != nil {
		return "", e
	}
	if len(rows) > 0 {
		return str(obj(rows[0])["id"]), nil
	}
	saved := q.body
	q.body = Object{"journey_id": templateID, "journey_version": version}
	defer func() { q.body = saved }()
	created, e := createGoal(q)
	if e != nil {
		return "", e
	}
	return str(obj(created.body)["id"]), nil
}

func evidenceTimeline(q *request) (response, error) {
	goalID := q.r.PathValue("id")
	before := q.countEvents()
	goal, e := q.one("SELECT jsonb_build_object('id',id,'status',status,'intern_id',intern_id) FROM app.goals WHERE id=$1 AND intern_id=$2", goalID, q.user["id"])
	if e != nil {
		return response{}, e
	}
	checks, e := q.many("SELECT jsonb_build_object('id',id,'kind','check','observed_at',observed_at,'label',CASE WHEN status='passed' THEN 'Проверка пройдена' WHEN error_code IS NOT NULL THEN 'Проверка не пройдена: '||error_code ELSE 'Проверка: '||status END,'source','go_check','trusted',true,'validity','current','step_id',step_id) FROM app.verification_checks WHERE goal_id=$1 AND observed_at IS NOT NULL", goalID)
	if e != nil {
		return response{}, e
	}
	evidence, e := q.many("SELECT jsonb_build_object('id',id,'kind','evidence','observed_at',observed_at,'label','Факт проверки: '||result,'source',source,'trusted',true,'validity',CASE WHEN invalidated_at IS NULL THEN 'current' ELSE 'invalidated' END,'step_id',step_id) FROM app.evidence WHERE goal_id=$1", goalID)
	if e != nil {
		return response{}, e
	}
	requests, e := q.many("SELECT jsonb_build_object('id',id,'kind','access_request','observed_at',created_at,'label','Заявка: '||status,'source','go_access','trusted',true,'validity','current') FROM app.access_requests WHERE goal_id=$1", goalID)
	if e != nil {
		return response{}, e
	}
	items := append(append(checks, evidence...), requests...)
	if items == nil {
		items = []any{}
	}
	if len(items) > 50 {
		items = items[:50]
	}
	if q.countEvents() != before {
		return response{}, fail(502, "UPSTREAM_ERROR")
	}
	current := Object{"status": goal["status"]}
	if code, e := q.openBlocker(goalID); e != nil {
		return response{}, e
	} else if code != "" {
		current["blocker_code"] = code
	}
	return out4("EvidenceTimeline", Object{"goal_id": goalID, "as_of": stamp(q.s.Now()), "current": current, "items": items}), nil
}

func (q *request) countEvents() int {
	var n int
	_ = q.tx.QueryRow(q.Context, "SELECT count(*) FROM app.business_events").Scan(&n)
	return n
}

func createRevisionProposal(q *request) (response, error) {
	report, e := q.one("SELECT to_jsonb(r) FROM app.task_clarity_reports r WHERE id=$1 AND owner_id=$2", q.r.PathValue("id"), q.user["id"])
	if e != nil {
		return response{}, e
	}
	if num(report["version"]) != num(q.body["expected_report_version"]) || num(report["brief_version"]) != num(q.body["base_brief_version"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	version, e := q.one("SELECT jsonb_build_object('content',content,'content_hash',content_hash) FROM app.task_brief_versions WHERE brief_id=$1 AND version=$2 AND state='published'", report["brief_id"], report["brief_version"])
	if e != nil {
		return response{}, e
	}
	content := obj(version["content"])
	fields := reportedFields(content, str(report["section_id"]))
	if len(fields) == 0 {
		return response{}, fail(422, "VALIDATION_ERROR")
	}
	baseHash := str(version["content_hash"])
	if len(baseHash) != 64 {
		baseHash = digest(encode(content))
	}
	status, origin := "unavailable", "rule_based"
	changes := []any{}
	questions := []any{"Модель недоступна. Отредактируйте черновик вручную."}
	draft, err := q.draftRevision(revisionDraftRequest(content, report, fields, baseHash))
	if err == nil {
		if st, or, ch, qs, bad := mapRevisionDraft(draft, fields, baseHash, num(report["brief_version"])); bad == nil {
			status, origin, changes, questions = st, or, ch, qs
		}
	}
	id := uuid()
	expires := q.s.Now().UTC().Add(10 * time.Minute)
	if e = q.exec("INSERT INTO app.revision_proposals(id,owner_id,report_id,brief_id,section_id,base_version,base_hash,status,origin,changes,questions,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)", id, q.user["id"], report["id"], report["brief_id"], report["section_id"], report["brief_version"], baseHash, status, origin, string(encode(changes)), string(encode(questions)), expires); e != nil {
		return response{}, e
	}
	return created4("RevisionProposal", proposalDTO(id, report["id"], status, origin, changes, questions, 1, expires, baseHash, num(report["brief_version"]))), nil
}

func proposalDTO(id string, reportID any, status, origin string, changes, questions []any, revision int, expires time.Time, baseHash string, baseVersion int) Object {
	if changes == nil {
		changes = []any{}
	}
	if questions == nil {
		questions = []any{}
	}
	return Object{
		"id": id, "report_id": reportID, "status": status, "origin": origin, "changes": changes, "questions": questions,
		"proposal_revision": revision, "expires_at": stamp(expires), "base_hash": baseHash, "base_version": baseVersion,
	}
}

func (q *request) proposal(id string) (Object, error) {
	row, e := q.one("SELECT to_jsonb(p) FROM app.revision_proposals p WHERE id=$1 AND owner_id=$2 FOR UPDATE", id, q.user["id"])
	if e != nil {
		return nil, e
	}
	expires, err := time.Parse(time.RFC3339, str(row["expires_at"]))
	if err == nil && !q.s.Now().Before(expires) && str(row["status"]) != "applied" && str(row["status"]) != "discarded" {
		row["status"] = "expired"
	}
	return row, nil
}

func getRevisionProposal(q *request) (response, error) {
	row, e := q.proposal(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	expires, _ := time.Parse(time.RFC3339, str(row["expires_at"]))
	return out4("RevisionProposal", proposalDTO(str(row["id"]), row["report_id"], str(row["status"]), str(row["origin"]), list(row["changes"]), list(row["questions"]), num(row["proposal_revision"]), expires, str(row["base_hash"]), num(row["base_version"]))), nil
}

func discardRevision(q *request) (response, error) {
	row, e := q.proposal(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if num(row["proposal_revision"]) != num(q.body["expected_revision"]) || str(row["status"]) == "applied" {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	if e = q.exec("UPDATE app.revision_proposals SET status='discarded', proposal_revision=proposal_revision+1 WHERE id=$1", row["id"]); e != nil {
		return response{}, e
	}
	row["status"] = "discarded"
	row["proposal_revision"] = num(row["proposal_revision"]) + 1
	expires, _ := time.Parse(time.RFC3339, str(row["expires_at"]))
	return out4("RevisionProposal", proposalDTO(str(row["id"]), row["report_id"], "discarded", str(row["origin"]), list(row["changes"]), list(row["questions"]), num(row["proposal_revision"]), expires, str(row["base_hash"]), num(row["base_version"]))), nil
}

func applyRevision(q *request) (response, error) {
	row, e := q.proposal(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if str(row["status"]) != "ready" || num(row["proposal_revision"]) != num(q.body["proposal_revision"]) || digest(encode(list(row["changes"]))) != str(q.body["preview_hash"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	selected := map[string]Object{}
	for _, id := range list(q.body["selected_change_ids"]) {
		for _, item := range list(row["changes"]) {
			change := obj(item)
			if str(change["id"]) == str(id) {
				selected[str(change["field"])] = change
			}
		}
	}
	if len(selected) != len(list(q.body["selected_change_ids"])) {
		return response{}, fail(422, "VALIDATION_ERROR")
	}
	published, e := q.one("SELECT jsonb_build_object('content',content,'version',version) FROM app.task_brief_versions WHERE brief_id=$1 AND version=$2 AND state='published'", row["brief_id"], row["base_version"])
	if e != nil {
		return response{}, e
	}
	drafts, e := q.many("SELECT jsonb_build_object('version',version,'content',content) FROM app.task_brief_versions WHERE brief_id=$1 AND state='draft'", row["brief_id"])
	if e != nil {
		return response{}, e
	}
	var content Object
	if q.body["expected_draft_revision"] == nil {
		if len(drafts) > 0 {
			return response{}, fail(409, "VERSION_CONFLICT")
		}
		content = obj(published["content"])
	} else {
		if len(drafts) != 1 || num(obj(drafts[0])["version"]) != num(q.body["expected_draft_revision"]) {
			return response{}, fail(409, "VERSION_CONFLICT")
		}
		content = obj(obj(drafts[0])["content"])
	}
	if e = applyChanges(content, selected); e != nil {
		return response{}, e
	}
	raw := string(encode(content))
	if q.body["expected_draft_revision"] == nil {
		if e = q.exec("INSERT INTO app.task_brief_versions(brief_id,version,state,content,content_hash,created_at) SELECT $1,max(version)+1,'draft',$2::jsonb,$3,$4 FROM app.task_brief_versions WHERE brief_id=$1", row["brief_id"], raw, digest(encode(content)), q.s.Now()); e != nil {
			return response{}, e
		}
	} else if e = q.exec("UPDATE app.task_brief_versions SET content=$2::jsonb, content_hash=$3 WHERE brief_id=$1 AND state='draft'", row["brief_id"], raw, digest(encode(content))); e != nil {
		return response{}, e
	}
	if e = q.exec("UPDATE app.revision_proposals SET status='applied', proposal_revision=proposal_revision+1 WHERE id=$1", row["id"]); e != nil {
		return response{}, e
	}
	row["status"] = "applied"
	expires, _ := time.Parse(time.RFC3339, str(row["expires_at"]))
	return out4("RevisionProposal", proposalDTO(str(row["id"]), row["report_id"], "applied", str(row["origin"]), list(row["changes"]), list(row["questions"]), num(row["proposal_revision"])+1, expires, str(row["base_hash"]), num(row["base_version"]))), nil
}

func applyChanges(content Object, selected map[string]Object) error {
	for field, change := range selected {
		if e := applyField(content, field, change); e != nil {
			return e
		}
	}
	return nil
}

func saveImpactConfig(q *request) (response, error) {
	brief, e := q.brief(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	current := 0
	_ = q.tx.QueryRow(q.Context, "SELECT COALESCE(max(revision),0) FROM app.impact_configs WHERE brief_id=$1", brief["id"]).Scan(&current)
	comparable, ok := q.body["comparable"].(bool)
	if !ok || current != num(q.body["expected_revision"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	fromA, toA, e := window(q.body["from_a"], q.body["to_a"])
	if e != nil {
		return response{}, e
	}
	fromB, toB, e := window(q.body["from_b"], q.body["to_b"])
	if e != nil {
		return response{}, e
	}
	if num(q.body["after_version"]) <= num(q.body["before_version"]) {
		return response{}, fail(422, "VALIDATION_ERROR")
	}
	next := current + 1
	if e = q.exec("INSERT INTO app.impact_configs(brief_id,revision,before_version,after_version,section_id,reason,comparable,from_a,to_a,from_b,to_b,policy_revision) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", brief["id"], next, q.body["before_version"], q.body["after_version"], q.body["section_id"], q.body["reason"], comparable, fromA, toA, fromB, toB, impactPolicyRev); e != nil {
		return response{}, e
	}
	return getImpact(q)
}

func window(from, to any) (time.Time, time.Time, error) {
	start, e := time.Parse(time.RFC3339, str(from))
	if e != nil {
		return time.Time{}, time.Time{}, fail(422, "VALIDATION_ERROR")
	}
	end, e := time.Parse(time.RFC3339, str(to))
	if e != nil || !start.Before(end) || end.Sub(start) > 90*24*time.Hour {
		return time.Time{}, time.Time{}, fail(422, "VALIDATION_ERROR")
	}
	return start, end, nil
}

func getImpact(q *request) (response, error) {
	brief, e := q.brief(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	cfg, e := q.one("SELECT to_jsonb(c) FROM app.impact_configs c WHERE brief_id=$1 ORDER BY revision DESC LIMIT 1", brief["id"])
	if e != nil {
		return response{}, e
	}
	asOf := q.s.Now().UTC()
	body := Object{
		"brief_id": brief["id"], "section_id": cfg["section_id"], "reason": cfg["reason"], "as_of": stamp(asOf),
		"policy_revision": impactPolicyRev, "comparable": cfg["comparable"] == true, "synthetic": true, "label": impactLabel,
		"before": Object{"version": num(cfg["before_version"]), "state": "no_exposure"},
		"after":  Object{"version": num(cfg["after_version"]), "state": "no_exposure"},
	}
	if cfg["comparable"] != true {
		body["state"] = "not_comparable"
		return out4("ImpactComparison", body), nil
	}
	before, after, e := q.cohorts(str(brief["id"]), num(cfg["before_version"]), num(cfg["after_version"]), str(cfg["section_id"]), str(cfg["reason"]), asOf, cfg)
	if e != nil {
		return response{}, e
	}
	left, right, delta := impactDelta(before, after)
	body["before"], body["after"] = left, right
	if delta != nil {
		body["delta_pp"] = delta
		body["state"] = "ready"
	} else if left["state"] == "suppressed" || right["state"] == "suppressed" {
		body["state"] = "insufficient_data"
	} else {
		body["state"] = "insufficient_data"
	}
	return out4("ImpactComparison", body), nil
}

func (q *request) cohorts(briefID string, versionA, versionB int, section, reason string, asOf time.Time, cfg Object) (Object, Object, error) {
	rows, e := q.many("SELECT jsonb_build_object('intern_id',intern_id,'version',version,'started_at',started_at,'ended_at',ended_at) FROM app.version_exposure_episodes WHERE brief_id=$1 AND version IN ($2,$3)", briefID, versionA, versionB)
	if e != nil {
		return nil, nil, e
	}
	fromA, _ := time.Parse(time.RFC3339, str(cfg["from_a"]))
	toA, _ := time.Parse(time.RFC3339, str(cfg["to_a"]))
	fromB, _ := time.Parse(time.RFC3339, str(cfg["from_b"]))
	toB, _ := time.Parse(time.RFC3339, str(cfg["to_b"]))
	type seen struct{ a, b bool }
	people := map[string]*seen{}
	for _, row := range rows {
		item := obj(row)
		started, err := time.Parse(time.RFC3339Nano, str(item["started_at"]))
		if err != nil {
			started, err = time.Parse(time.RFC3339, str(item["started_at"]))
			if err != nil {
				continue
			}
		}
		var ended *time.Time
		if str(item["ended_at"]) != "" {
			if parsed, err := time.Parse(time.RFC3339Nano, str(item["ended_at"])); err == nil {
				ended = &parsed
			}
		}
		id := str(item["intern_id"])
		if people[id] == nil {
			people[id] = &seen{}
		}
		if num(item["version"]) == versionA && exposureEligible(started, ended, asOf, fromA, toA) {
			people[id].a = true
		}
		if num(item["version"]) == versionB && exposureEligible(started, ended, asOf, fromB, toB) {
			people[id].b = true
		}
	}
	eligibleA, eligibleB := map[string]bool{}, map[string]bool{}
	for id, flags := range people {
		if flags.a && flags.b {
			continue
		}
		if flags.a {
			eligibleA[id] = true
		}
		if flags.b {
			eligibleB[id] = true
		}
	}
	affectedA, e := q.affected(briefID, versionA, section, reason, eligibleA)
	if e != nil {
		return nil, nil, e
	}
	affectedB, e := q.affected(briefID, versionB, section, reason, eligibleB)
	if e != nil {
		return nil, nil, e
	}
	return cohortView(versionA, len(eligibleA), affectedA), cohortView(versionB, len(eligibleB), affectedB), nil
}

func (q *request) affected(briefID string, version int, section, reason string, eligible map[string]bool) (int, error) {
	if len(eligible) == 0 {
		return 0, nil
	}
	rows, e := q.many("SELECT jsonb_build_object('intern_id',f.intern_id,'first_seen',f.first_seen,'started_at',e.started_at) FROM app.task_frictions f JOIN app.version_exposure_episodes e ON e.assignment_id=f.assignment_id AND e.version=f.brief_version AND e.intern_id=f.intern_id JOIN app.task_clarity_reports r ON r.brief_id=f.brief_id AND r.brief_version=f.brief_version AND r.section_id=f.section_id AND r.reason=f.reason WHERE f.brief_id=$1 AND f.brief_version=$2 AND f.section_id=$3 AND f.reason=$4 AND r.state='accepted'", briefID, version, section, reason)
	if e != nil {
		return 0, e
	}
	count := map[string]bool{}
	for _, row := range rows {
		item := obj(row)
		id := str(item["intern_id"])
		if !eligible[id] {
			continue
		}
		started, e1 := time.Parse(time.RFC3339Nano, str(item["started_at"]))
		seen, e2 := time.Parse(time.RFC3339Nano, str(item["first_seen"]))
		if e1 != nil || e2 != nil {
			continue
		}
		if !seen.Before(started) && seen.Before(started.Add(impactWindow)) {
			count[id] = true
		}
	}
	return len(count), nil
}
