package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
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
	id := uuid()
	if e := q.exec("INSERT INTO app.version_exposure_episodes(id,intern_id,assignment_id,brief_id,version,source,started_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", id, internID, assignmentID, briefID, version, source, q.s.Now()); e != nil {
		return e
	}
	return q.v4WorkflowEvent("brief_version_exposed", "task_assignment", assignmentID, Object{"assignment_id": assignmentID, "brief_id": briefID, "brief_version": version, "episode_id": id})
}
func (q *request) closeExposure(assignmentID, reason string) error {
	tag, e := q.tx.Exec(q.Context, "UPDATE app.version_exposure_episodes SET ended_at=$3,end_reason=$2 WHERE assignment_id=$1 AND ended_at IS NULL", assignmentID, reason, q.s.Now())
	if e != nil || tag.RowsAffected() == 0 {
		return e
	}
	return q.v4WorkflowEvent("brief_version_exposure_ended", "task_assignment", assignmentID, Object{"assignment_id": assignmentID, "reason": reason})
}

func listWorkspaces(q *request) (response, error) {
	c, limit, e := q.v4Page("workspace", 20)
	if e != nil {
		return response{}, e
	}
	var after any
	if c.Sort != "" {
		after = c.Sort
	}
	id := c.ID
	if id == "" {
		id = "00000000-0000-4000-8000-000000000000"
	}
	rows, e := q.many(`SELECT jsonb_build_object('id',id,'kind',kind,'sort_time',created_at) FROM (
 SELECT id,'assignment' AS kind,created_at FROM app.task_assignments WHERE intern_id=$1
 UNION ALL SELECT g.id,'goal',g.created_at FROM app.goals g WHERE g.intern_id=$1 AND NOT EXISTS(SELECT 1 FROM app.workspace_links l WHERE l.goal_id=g.id AND l.active)
 ) entries WHERE created_at<=$2 AND ($3::timestamptz IS NULL OR (created_at,kind,id)<($3,$4,$5::uuid)) ORDER BY created_at DESC,kind DESC,id DESC LIMIT $6`, q.user["id"], c.At, after, c.Kind, id, limit+1)
	if e != nil {
		return response{}, e
	}
	var next any
	if len(rows) > limit {
		rows = rows[:limit]
		next = c.next(obj(rows[len(rows)-1]))
	}
	items, unlinked := []any{}, []any{}
	for _, r := range rows {
		row := obj(r)
		if row["kind"] == "assignment" {
			card, err := q.workspaceCard(str(row["id"]))
			if err != nil {
				return response{}, err
			}
			items = append(items, card)
			continue
		}
		if !q.goalVisible(str(row["id"])) {
			continue
		}
		g, err := q.one("SELECT jsonb_build_object('id',g.id,'title',COALESCE(NULLIF(t.document->>'title',''),g.journey_id),'status',g.status) FROM app.goals g JOIN app.journey_templates t ON t.journey_id=g.journey_id AND t.version=g.journey_version WHERE g.id=$1", row["id"])
		if err != nil {
			return response{}, err
		}
		unlinked = append(unlinked, Object{"kind": "goal", "id": g["id"], "title": g["title"], "link_status": "unlinked", "technical_status": technicalStatus(str(g["status"])), "next_action": nextAction(str(g["status"]), false), "goal": Object{"id": g["id"], "title": g["title"], "status": schemaStatus(str(g["status"]))}})
	}
	return out4("WorkspaceList", Object{"items": items, "unlinked_goals": unlinked, "as_of": c.At.Format(time.RFC3339Nano), "next_cursor": next}), nil
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
	if e = q.v4WorkflowEvent("workspace_linked", "goal", goalID, Object{"assignment_id": a["id"], "goal_id": goalID, "template_id": preview["template_id"], "template_version": preview["template_version"]}); e != nil {
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
	if !q.goalVisible(goalID) {
		return response{}, fail(404, "NOT_FOUND")
	}
	c, limit, e := q.v4Page("proof:"+goalID, 50)
	if e != nil {
		return response{}, e
	}
	goal, e := q.one("SELECT jsonb_build_object('status',status) FROM app.goals WHERE id=$1", goalID)
	if e != nil {
		return response{}, e
	}
	var after any
	if c.Sort != "" {
		after = c.Sort
	}
	id := c.ID
	if id == "" {
		id = "00000000-0000-4000-8000-000000000000"
	}
	rows, e := q.many(`SELECT jsonb_build_object('id',id,'kind',kind,'sort_time',observed_at,'entry',entry) FROM (
 SELECT id,'check' AS kind,observed_at,received_at,jsonb_strip_nulls(jsonb_build_object('id',id,'kind','check','observed_at',observed_at,'received_at',received_at,'label',CASE WHEN status='passed' THEN 'Проверка пройдена' WHEN error_code IS NOT NULL THEN 'Проверка не пройдена: '||error_code ELSE 'Проверка: '||status END,'source','go_check','trusted',true,'validity','current','step_id',step_id)) AS entry FROM app.verification_checks WHERE goal_id=$1
 UNION ALL SELECT id,'evidence',observed_at,received_at,jsonb_strip_nulls(jsonb_build_object('id',id,'kind','evidence','observed_at',observed_at,'received_at',received_at,'label','Факт проверки: '||result,'source',source,'trusted',true,'validity',CASE WHEN invalidated_at IS NULL THEN 'current' ELSE 'invalidated' END,'step_id',step_id)) FROM app.evidence WHERE goal_id=$1
 UNION ALL SELECT id,'access_request',created_at,received_at,jsonb_strip_nulls(jsonb_build_object('id',id,'kind','access_request','observed_at',created_at,'received_at',received_at,'label','Заявка зарегистрирована','source','go_access','trusted',true,'validity','current')) FROM app.access_requests WHERE goal_id=$1
 UNION ALL SELECT e.id,'access_request',e.occurred_at,e.received_at,jsonb_strip_nulls(jsonb_build_object('id',e.id,'kind','access_request','observed_at',e.occurred_at,'received_at',e.received_at,'label',CASE e.event_type WHEN 'access_request_created' THEN 'Заявка отправлена' WHEN 'access_request_approved' THEN 'Заявка одобрена; доступ подтверждает IAM' ELSE 'Заявка отклонена' END,'source',e.source,'trusted',true,'validity','current')) FROM app.business_events e JOIN app.access_requests a ON e.entity_type='access_request' AND e.entity_id=a.id WHERE a.goal_id=$1 AND e.event_type IN ('access_request_created','access_request_approved','access_request_rejected')
 ) entries WHERE observed_at IS NOT NULL AND (received_at IS NULL OR received_at<=$2) AND ($3::timestamptz IS NULL OR (observed_at,kind,id)<($3,$4,$5::uuid)) ORDER BY observed_at DESC,kind DESC,id DESC LIMIT $6`, goalID, c.At, after, c.Kind, id, limit+1)
	if e != nil {
		return response{}, e
	}
	var next any
	if len(rows) > limit {
		rows = rows[:limit]
		next = c.next(obj(rows[len(rows)-1]))
	}
	items := []any{}
	for _, row := range rows {
		items = append(items, obj(row)["entry"])
	}
	if code, err := q.openBlocker(goalID); err != nil {
		return response{}, err
	} else if code != "" {
		goal["blocker_code"] = code
	}
	return out4("EvidenceTimeline", Object{"goal_id": goalID, "as_of": c.At.Format(time.RFC3339Nano), "current": goal, "items": items, "next_cursor": next}), nil
}

func createRevisionProposal(q *request) (response, error) {
	report, e := q.report(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	brief, e := q.brief(str(report["brief_id"]))
	if e != nil {
		return response{}, e
	}
	if num(report["version"]) != num(q.body["expected_report_version"]) || num(report["brief_version"]) != num(q.body["base_brief_version"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	versions, e := q.many("SELECT jsonb_build_object('content',content,'version',version,'state',state) FROM app.task_brief_versions WHERE brief_id=$1 ORDER BY version DESC", brief["id"])
	if e != nil {
		return response{}, e
	}
	var content Object
	var draftVersion any
	latest := 0
	for _, item := range versions {
		v := obj(item)
		if v["state"] == "published" && latest == 0 {
			latest = num(v["version"])
		}
		if content == nil {
			if v["state"] == "draft" {
				draftVersion = v["version"]
			}
			content = obj(v["content"])
		}
	}
	if latest != num(report["brief_version"]) || brief["archived_at"] != nil {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	text := sectionBody(content, str(report["section_id"]))
	if text == "" {
		return response{}, fail(422, "VALIDATION_ERROR")
	}
	field := "sections." + str(report["section_id"]) + ".text"
	if report["section_id"] == "goal" || report["section_id"] == "expected_result" {
		field = str(report["section_id"])
	}
	if report["section_id"] == "acceptance_criteria" {
		field = "acceptance_criteria." + str(obj(list(content["acceptance_criteria"])[0])["id"]) + ".text"
	}
	label, _ := sectionTitle(content, str(report["section_id"]))
	hash := digest([]byte(text))
	input := Object{"brief_title": content["title"], "base_version": report["brief_version"], "base_hash": hash,
		"report": revisionReport(report),
		"fields": []any{Object{"path": strings.ReplaceAll(field, ".", "/"), "label": label, "text": text, "hash": hash}}, "refs": []any{}}
	if q.body["answers"] != nil {
		input["answers"] = q.body["answers"]
	}
	id, token := uuid(), uuid()
	if e = q.exec("INSERT INTO app.revision_proposals(id,owner_id,report_id,brief_id,section_id,base_version,base_hash,status,origin,changes,questions,expires_at,generation_token,base_revision,base_fields,draft_version) VALUES ($1,$2,$3,$4,$5,$6,$7,'generating','rule_based','[]','[]',$8,$9,$10,$11::jsonb,$12)", id, q.user["id"], report["id"], brief["id"], report["section_id"], report["brief_version"], hash, q.s.Now().Add(10*time.Minute), token, brief["revision"], string(encode([]any{Object{"field": field, "label": label, "text": text}})), draftVersion); e != nil {
		return response{}, e
	}
	if e = q.v4WorkflowEvent("proposal_requested", "revision_proposal", id, Object{"brief_id": brief["id"], "report_id": report["id"], "base_version": report["brief_version"], "base_revision": brief["revision"], "base_hash": hash}); e != nil {
		return response{}, e
	}
	row, e := q.proposal(id)
	if e != nil {
		return response{}, e
	}
	owner := clone(q.user)
	q.after = append(q.after, func() { q.s.generateRevision(id, token, owner, input, field) })
	return created4("RevisionProposal", revisionDTO(row)), nil
}

// The provider runs after reservation commit: no application transaction/lock is held.
func (s *Server) generateRevision(id, token string, owner, input Object, field string) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	call := &request{Context: ctx, s: s, requestID: uuid(), client: s.slowClient(85 * time.Second)}
	draft, callErr := call.call(s.Config.AIURL, "POST", "/internal/v4/revision-draft", "v4/ai/RevisionDraftResponse", input, nil)
	finishCtx, finishCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer finishCancel()
	tx, e := s.Pool.Begin(finishCtx)
	if e != nil {
		return
	}
	defer tx.Rollback(context.Background())
	q := &request{Context: finishCtx, s: s, tx: tx, user: owner, requestID: call.requestID}
	// Read current roles and team, and reject old scope rather than upgrading a captured one.
	current, e := q.one(userSQL, owner["id"])
	if e != nil {
		return
	}
	if current["team_id"] != owner["team_id"] || !has(current["roles"], "buddy") {
		return
	}
	q.user = current
	row, e := q.proposal(id)
	if e != nil || row["status"] != "generating" || row["generation_token"] != token {
		return
	}
	brief, e := q.brief(str(row["brief_id"]))
	if e != nil {
		return
	}
	status, origin := "unavailable", "rule_based"
	changes := []any{}
	questions := []any{"Модель недоступна. Отредактируйте черновик вручную."}
	detail := Object{"answered_by": "offline", "reason_code": "generation_unavailable"}
	rationale := ""
	if num(brief["revision"]) != num(row["base_revision"]) || brief["archived_at"] != nil {
		questions = []any{"ТЗ изменилось во время генерации. Запросите новое предложение."}
	} else if callErr == nil && draft["base_hash"] == input["base_hash"] && num(draft["base_version"]) == num(input["base_version"]) && len(list(draft["evidence_refs"])) == 0 {
		valid := true
		for _, value := range list(draft["changes"]) {
			c := obj(value)
			if c["path"] != strings.ReplaceAll(field, ".", "/") {
				valid = false
				break
			}
			changes = append(changes, Object{"id": c["id"], "field": field, "old_hash": c["old_hash"], "replacement": c["replacement"], "label": c["label"], "rationale": c["rationale"]})
		}
		if valid && safeRevision(Object{"changes": changes}, str(input["base_hash"])) {
			status = str(draft["outcome"])
			if status == "no_change" {
				status = "needs_input"
			}
			detail = obj(draft["origin"])
			rationale = str(draft["rationale"])
			if detail["answered_by"] != "offline" {
				origin = "model"
			}
			questions = []any{}
			for _, v := range list(draft["questions"]) {
				questions = append(questions, obj(v)["text"])
			}
			if status == "needs_input" && len(questions) == 0 {
				questions = append(questions, "Автоматическая правка не предложена. Проверьте текст вручную.")
			}
		} else {
			changes = []any{}
		}
	}
	if e = q.exec("UPDATE app.revision_proposals SET status=$2,origin=$3,changes=$4::jsonb,questions=$5::jsonb,origin_detail=$6::jsonb,rationale=$8,proposal_revision=proposal_revision+1 WHERE id=$1 AND generation_token=$7 AND status='generating'", id, status, origin, string(encode(changes)), string(encode(questions)), string(encode(detail)), token, rationale); e == nil {
		if e = q.v4WorkflowEvent("proposal_generated", "revision_proposal", id, Object{"brief_id": row["brief_id"], "report_id": row["report_id"], "status": status, "origin": origin, "preview_hash": digest(encode(changes))}); e == nil {
			_ = tx.Commit(finishCtx)
		}
	}
}

// revisionReport is the safe aggregate for the AI: no intern IDs, names or chat; the v3
// hypothesis is shared text about the brief and helps the model aim the edit.
func revisionReport(report Object) Object {
	count := num(report["lifetime_count"])
	if count < 2 {
		count = 2
	} else if count > 100 {
		count = 100
	}
	out := Object{"section_id": report["section_id"], "reason": report["reason"], "affected_count": count}
	if h := []rune(strings.TrimSpace(str(report["hypothesis"]))); len(h) > 0 {
		if len(h) > 2000 {
			h = h[:2000]
		}
		out["hypothesis"] = string(h)
	}
	return out
}

func revisionDTO(row Object) Object {
	expires, _ := time.Parse(time.RFC3339, str(row["expires_at"]))
	result := proposalDTO(str(row["id"]), row["report_id"], str(row["status"]), str(row["origin"]), list(row["changes"]), list(row["questions"]), num(row["proposal_revision"]), expires, str(row["base_hash"]), num(row["base_version"]))
	result["draft_version"] = row["draft_version"]
	if row["rationale"] != nil {
		result["rationale"] = row["rationale"]
	}
	if row["base_revision"] != nil {
		result["base_revision"] = row["base_revision"]
		result["base_fields"] = row["base_fields"]
	}
	if d := obj(row["origin_detail"]); d != nil {
		result["answered_by"] = d["answered_by"]
	}
	return result
}

func safeRevision(draft Object, baseHash string) bool {
	if len(list(draft["changes"])) > 10 || len(list(draft["questions"])) > 10 {
		return false
	}
	seen := map[string]bool{}
	for _, item := range list(draft["changes"]) {
		change := obj(item)
		field := str(change["field"])
		allowed := field == "goal" || field == "expected_result" || ((strings.HasPrefix(field, "sections.") || strings.HasPrefix(field, "acceptance_criteria.")) && strings.HasSuffix(field, ".text"))
		if seen[field] || !allowed {
			return false
		}
		seen[field] = true
		replacement := str(change["replacement"])
		if replacement == "" || utf8.RuneCountInString(replacement) > 4000 || strings.Contains(replacement, "<") || str(change["old_hash"]) != baseHash {
			return false
		}
	}
	return true
}

func sectionBody(content Object, sectionID string) string {
	if sectionID == "goal" || sectionID == "expected_result" {
		return str(content[sectionID])
	}
	if sectionID == "acceptance_criteria" {
		items := list(content["acceptance_criteria"])
		if len(items) > 0 {
			return str(obj(items[0])["text"])
		}
		return ""
	}
	for _, item := range list(obj(content)["sections"]) {
		section := obj(item)
		if str(section["id"]) == sectionID {
			return str(section["text"])
		}
	}
	return ""
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
		"preview_hash": digest(encode(changes)), "proposal_revision": revision, "expires_at": stamp(expires), "base_hash": baseHash, "base_version": baseVersion,
	}
}

func (q *request) proposal(id string) (Object, error) {
	row, e := q.one("SELECT to_jsonb(p) FROM app.revision_proposals p WHERE id=$1 AND owner_id=$2 FOR UPDATE", id, q.user["id"])
	if e != nil {
		return nil, e
	}
	if _, err := q.brief(str(row["brief_id"])); err != nil {
		return nil, err
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
	return out4("RevisionProposal", revisionDTO(row)), nil
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
	if e = q.v4WorkflowEvent("proposal_discarded", "revision_proposal", str(row["id"]), Object{"brief_id": row["brief_id"]}); e != nil {
		return response{}, e
	}
	row["status"] = "discarded"
	row["proposal_revision"] = num(row["proposal_revision"]) + 1
	return out4("RevisionProposal", revisionDTO(row)), nil
}

func applyRevision(q *request) (response, error) {
	row, e := q.proposal(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if str(row["status"]) != "ready" || num(row["proposal_revision"]) != num(q.body["proposal_revision"]) || digest(encode(list(row["changes"]))) != str(q.body["preview_hash"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	brief, e := q.brief(str(row["brief_id"]))
	if e == nil && (brief["archived_at"] != nil || (row["base_revision"] != nil && num(brief["revision"]) != num(row["base_revision"]))) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	if e != nil {
		return response{}, e
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
		if len(drafts) != 1 || num(brief["revision"]) != num(q.body["expected_draft_revision"]) {
			return response{}, fail(409, "VERSION_CONFLICT")
		}
		content = obj(obj(drafts[0])["content"])
	}
	if e = applyChanges(content, selected); e != nil {
		return response{}, e
	}
	content, e = q.briefContent(content)
	if e != nil {
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
	if e = q.exec("UPDATE app.task_briefs SET revision=revision+1, updated_at=$2 WHERE id=$1", row["brief_id"], q.s.Now()); e != nil {
		return response{}, e
	}
	if e = q.exec("UPDATE app.revision_proposals SET status='applied', proposal_revision=proposal_revision+1,draft_version=(SELECT version FROM app.task_brief_versions WHERE brief_id=app.revision_proposals.brief_id AND state='draft') WHERE id=$1", row["id"]); e != nil {
		return response{}, e
	}
	var draftVersion int
	if e = q.tx.QueryRow(q.Context, "SELECT version FROM app.task_brief_versions WHERE brief_id=$1 AND state='draft'", row["brief_id"]).Scan(&draftVersion); e != nil {
		return response{}, e
	}
	if e = q.v4WorkflowEvent("proposal_applied", "revision_proposal", str(row["id"]), Object{"brief_id": row["brief_id"], "draft_version": draftVersion, "preview_hash": q.body["preview_hash"]}); e != nil {
		return response{}, e
	}
	row["draft_version"] = draftVersion
	row["status"] = "applied"
	row["proposal_revision"] = num(row["proposal_revision"]) + 1
	return out4("RevisionProposal", revisionDTO(row)), nil
}

func applyChanges(content Object, selected map[string]Object) error {
	for field, change := range selected {
		if field == "goal" || field == "expected_result" {
			if digest([]byte(str(content[field]))) != str(change["old_hash"]) {
				return fail(409, "VERSION_CONFLICT")
			}
			content[field] = change["replacement"]
			continue
		}
		area := "sections"
		if strings.HasPrefix(field, "acceptance_criteria.") {
			area = "acceptance_criteria"
		}
		sections := list(content[area])
		id := strings.TrimSuffix(strings.TrimPrefix(field, area+"."), ".text")
		found := false
		for _, item := range sections {
			section := obj(item)
			if str(section["id"]) != id {
				continue
			}
			if digest([]byte(str(section["text"]))) != str(change["old_hash"]) {
				return fail(409, "VERSION_CONFLICT")
			}
			section["text"] = change["replacement"]
			found = true
		}
		if !found {
			return fail(422, "VALIDATION_ERROR")
		}
	}
	return nil
}

func saveImpactConfig(q *request) (response, error) {
	brief, e := q.brief(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if brief["archived_at"] != nil {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	for _, version := range []any{q.body["before_version"], q.body["after_version"]} {
		published, err := q.publishedVersion(brief["id"], version)
		if err != nil {
			return response{}, err
		}
		if !published {
			return response{}, fail(422, "VALIDATION_ERROR")
		}
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
		"config_revision": cfg["revision"], "policy_revision": impactPolicyRev, "comparable": cfg["comparable"] == true, "synthetic": true, "label": impactLabel,
		"before": Object{"version": num(cfg["before_version"]), "state": "no_exposure"},
		"after":  Object{"version": num(cfg["after_version"]), "state": "no_exposure"},
	}
	body["clock_source"] = "server_wall_clock"
	if q.s.Config.DemoClockFile != "" {
		body["clock_source"] = "synthetic_test_clock"
		body["label"] = "Синтетическая история на тестовых часах; " + impactLabel
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
	rows, e := q.many("SELECT jsonb_build_object('intern_id',e.intern_id,'version',e.version,'started_at',e.started_at,'ended_at',e.ended_at,'received_at',e.received_at) FROM app.version_exposure_episodes e JOIN app.users u ON u.id=e.intern_id JOIN app.task_briefs b ON b.id=e.brief_id WHERE e.brief_id=$1 AND e.version IN ($2,$3) AND u.team=b.team_id AND EXISTS(SELECT 1 FROM app.role_assignments r WHERE r.user_id=u.id AND r.role='intern')", briefID, versionA, versionB)
	if e != nil {
		return nil, nil, e
	}
	fromA, _ := time.Parse(time.RFC3339, str(cfg["from_a"]))
	toA, _ := time.Parse(time.RFC3339, str(cfg["to_a"]))
	fromB, _ := time.Parse(time.RFC3339, str(cfg["from_b"]))
	toB, _ := time.Parse(time.RFC3339, str(cfg["to_b"]))
	type seen struct{ a, b bool }
	people := map[string]*seen{}
	eligibleA, eligibleB := map[string]bool{}, map[string]bool{}
	unknown := map[int]bool{}
	observed := map[int]bool{}
	for _, row := range rows {
		item := obj(row)
		version := num(item["version"])
		observed[version] = true
		if item["received_at"] == nil {
			unknown[version] = true
			continue
		}
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
		if version == versionA {
			people[id].a = true
			if exposureEligible(started, ended, asOf, fromA, toA) {
				eligibleA[id] = true
			}
		}
		if version == versionB {
			people[id].b = true
			if exposureEligible(started, ended, asOf, fromB, toB) {
				eligibleB[id] = true
			}
		}
	}
	for id, flags := range people {
		if flags.a && flags.b {
			delete(eligibleA, id)
			delete(eligibleB, id)
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
	if affectedA < 0 {
		unknown[versionA] = true
		affectedA = 0
	}
	if affectedB < 0 {
		unknown[versionB] = true
		affectedB = 0
	}
	left, right := cohortView(versionA, len(eligibleA), affectedA), cohortView(versionB, len(eligibleB), affectedB)
	for version, side := range map[int]Object{versionA: left, versionB: right} {
		if unknown[version] || (side["state"] == "no_exposure" && observed[version]) {
			for key := range side {
				delete(side, key)
			}
			side["version"] = version
			side["state"] = "insufficient_data"
		}
	}
	return left, right, nil
}

func (q *request) affected(briefID string, version int, section, reason string, eligible map[string]bool) (int, error) {
	if len(eligible) == 0 {
		return 0, nil
	}
	rows, e := q.many("SELECT jsonb_build_object('intern_id',f.intern_id,'first_seen',f.first_seen,'received_at',f.received_at,'started_at',e.started_at) FROM app.task_frictions f JOIN app.version_exposure_episodes e ON e.assignment_id=f.assignment_id AND e.version=f.brief_version AND e.intern_id=f.intern_id JOIN app.task_clarity_reports r ON r.brief_id=f.brief_id AND r.brief_version=f.brief_version AND r.section_id=f.section_id AND r.reason=f.reason WHERE f.brief_id=$1 AND f.brief_version=$2 AND f.section_id=$3 AND f.reason=$4 AND r.state IN ('accepted','resolved')", briefID, version, section, reason)
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
		if item["received_at"] == nil {
			return -1, nil
		} // Unknown history cannot become a known zero.
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
