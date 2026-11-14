package api

import (
	"net/http"
	"strings"
)

// Mentor task briefs: draft -> published (immutable) -> archived; assignments are pinned to a
// published version and move to a newer one only by an explicit adopt with expected_revision.

func (s *Server) taskRoutes(m *http.ServeMux) {
	s.route(m, "GET /api/v3/mentor/interns", "", "buddy", false, listMentorInterns)
	s.route(m, "GET /api/v3/task-briefs", "", "buddy", false, listBriefs)
	s.route(m, "POST /api/v3/task-briefs", "v3/public/TaskBriefCreateRequest", "buddy", true, createBrief)
	s.route(m, "GET /api/v3/task-briefs/{id}", "", "buddy", false, getBrief)
	s.route(m, "POST /api/v3/task-briefs/{id}/draft", "v3/public/TaskBriefDraftRequest", "buddy", false, saveDraft)
	s.route(m, "POST /api/v3/task-briefs/{id}/publish", "v3/public/RevisionRequest", "buddy", false, publishBrief)
	s.route(m, "POST /api/v3/task-briefs/{id}/archive", "v3/public/RevisionRequest", "buddy", false, archiveBrief)
	s.route(m, "POST /api/v3/task-assignments", "v3/public/TaskAssignmentCreateRequest", "buddy", true, createAssignment)
	s.route(m, "GET /api/v3/task-assignments", "", "", false, listAssignments)
	s.route(m, "GET /api/v3/task-assignments/{id}/latest-version", "", "", false, previewAssignmentVersion)
	s.route(m, "GET /api/v3/task-assignments/{id}", "", "", false, getAssignment)
	s.route(m, "POST /api/v3/task-assignments/{id}/adopt-version", "v3/public/TaskAssignmentAdoptRequest", "", false, adoptVersion)
	s.route(m, "POST /api/v3/task-assignments/{id}/frictions", "v3/public/FrictionCreateRequest", "intern", true, reportFriction)
	s.route(m, "GET /api/v3/task-clarity-reports", "", "buddy", false, listReports)
	s.route(m, "GET /api/v3/task-clarity-reports/{id}", "", "buddy", false, getReport)
	s.route(m, "POST /api/v3/task-clarity-reports/{id}/review", "v3/public/TaskClarityReviewRequest", "buddy", true, reviewReport)
}

// Fixed parts of every brief that an intern may also mark as unclear.
var reservedSections = map[string]string{
	"goal":                "Цель задания",
	"expected_result":     "Ожидаемый результат",
	"acceptance_criteria": "Критерии приёмки",
}

func sectionTitle(content Object, id string) (string, bool) {
	if title, ok := reservedSections[id]; ok {
		return title, true
	}
	for _, v := range list(content["sections"]) {
		if obj(v)["id"] == id {
			return str(obj(v)["title"]), true
		}
	}
	return "", false
}

func sectionText(content Object, id string) string {
	switch id {
	case "goal":
		return str(content["goal"])
	case "expected_result":
		return str(content["expected_result"])
	case "acceptance_criteria":
		texts := []string{}
		for _, v := range list(content["acceptance_criteria"]) {
			texts = append(texts, "- "+str(obj(v)["text"]))
		}
		if len(texts) == 0 {
			return "Критерии приёмки не заданы."
		}
		return strings.Join(texts, "\n")
	}
	for _, v := range list(content["sections"]) {
		if obj(v)["id"] == id {
			return str(obj(v)["text"])
		}
	}
	return ""
}

// briefContent checks what the schema cannot: unique stable IDs and references the author may read.
// Free text passes the same secret redaction as other human input.
func (q *request) briefContent(raw any) (Object, error) {
	c := clone(raw)
	for _, k := range []string{"title", "goal", "expected_result"} {
		c[k] = clean(str(c[k]))
	}
	seen := map[string]bool{}
	for k := range reservedSections {
		seen[k] = true
	}
	for _, v := range list(c["sections"]) {
		section := obj(v)
		id := str(section["id"])
		if seen[id] {
			return nil, fail(422, "VALIDATION_ERROR")
		}
		seen[id] = true
		section["title"] = clean(str(section["title"]))
		section["text"] = clean(str(section["text"]))
	}
	criteria := map[string]bool{}
	for _, v := range list(c["acceptance_criteria"]) {
		criterion := obj(v)
		if criteria[str(criterion["id"])] {
			return nil, fail(422, "VALIDATION_ERROR")
		}
		criteria[str(criterion["id"])] = true
		criterion["text"] = clean(str(criterion["text"]))
	}
	docs := map[string]bool{}
	for _, v := range list(c["refs"]) {
		ref := obj(v)
		id := str(ref["document_id"])
		yes, e := q.canRead(id, q.user)
		if e != nil {
			return nil, e
		}
		if !yes || docs[id] {
			return nil, fail(422, "VALIDATION_ERROR")
		}
		docs[id] = true
		if _, e = q.sources([]any{ref}, q.user); e != nil {
			return nil, fail(422, "VALIDATION_ERROR")
		}
	}
	if q.s.Validate("v3/public/BriefContent", c) != nil {
		return nil, fail(422, "VALIDATION_ERROR")
	}
	return c, nil
}

// brief returns the caller's own brief in the caller's current team, locked for update.
func (q *request) brief(id string) (Object, error) {
	return q.one("SELECT to_jsonb(b) FROM app.task_briefs b WHERE id=$1 AND owner_id=$2 AND team_id=$3 FOR UPDATE", id, q.user["id"], q.user["team_id"])
}

func (q *request) briefDTO(b Object) (Object, error) {
	versions, e := q.many("SELECT jsonb_strip_nulls(jsonb_build_object('brief_id',brief_id,'version',version,'state',state,'content',content,'content_hash',content_hash,'created_at',created_at,'published_at',published_at)) FROM app.task_brief_versions WHERE brief_id=$1 ORDER BY version", b["id"])
	if e != nil {
		return nil, e
	}
	var latest, draft any
	summaries := []any{}
	for _, v := range versions {
		version := obj(v)
		summary := Object{"version": version["version"], "state": version["state"]}
		if version["state"] == "published" {
			latest = version
			summary["published_at"] = version["published_at"]
		} else {
			draft = version
		}
		summaries = append(summaries, summary)
	}
	state := "draft"
	title := ""
	if latest != nil {
		state = "published"
		title = str(obj(obj(latest)["content"])["title"])
	} else if draft != nil {
		title = str(obj(obj(draft)["content"])["title"])
	}
	if b["archived_at"] != nil {
		state = "archived"
	}
	var assignments, reports int
	if e = q.tx.QueryRow(q.Context, "SELECT (SELECT count(*) FROM app.task_assignments WHERE brief_id=$1),(SELECT count(*) FROM app.task_clarity_reports WHERE brief_id=$1 AND state IN ('proposed','under_review','accepted'))", b["id"]).Scan(&assignments, &reports); e != nil {
		return nil, e
	}
	return Object{"id": b["id"], "title": title, "state": state, "latest_published_version": latest, "draft": draft, "versions": summaries, "assignment_count": assignments, "open_report_count": reports, "revision": b["revision"], "created_at": b["created_at"], "updated_at": b["updated_at"]}, nil
}

func (q *request) briefResponse(id string, status int) (response, error) {
	b, e := q.brief(id)
	if e != nil {
		return response{}, e
	}
	dto, e := q.briefDTO(b)
	return response{status, dto, "v3/public/TaskBrief"}, e
}

func listMentorInterns(q *request) (response, error) {
	items, e := q.many("SELECT jsonb_build_object('id',u.id,'display_name',u.display_name) FROM app.users u JOIN app.role_assignments r ON r.user_id=u.id AND r.role='intern' WHERE u.team=$1 AND u.id<>$2 ORDER BY u.display_name,u.id LIMIT 100", q.user["team_id"], q.user["id"])
	return out3("InternList", Object{"items": items}), e
}

func listBriefs(q *request) (response, error) {
	rows, e := q.many("SELECT to_jsonb(b) FROM app.task_briefs b WHERE owner_id=$1 AND team_id=$2 ORDER BY updated_at DESC,id LIMIT 100", q.user["id"], q.user["team_id"])
	if e != nil {
		return response{}, e
	}
	items := []any{}
	for _, row := range rows {
		dto, e := q.briefDTO(obj(row))
		if e != nil {
			return response{}, e
		}
		items = append(items, dto)
	}
	return out3("TaskBriefList", Object{"items": items}), nil
}

func getBrief(q *request) (response, error) {
	return q.briefResponse(q.r.PathValue("id"), 200)
}

func createBrief(q *request) (response, error) {
	content, e := q.briefContent(q.body["content"])
	if e != nil {
		return response{}, e
	}
	id := uuid()
	if e = q.exec("INSERT INTO app.task_briefs(id,owner_id,team_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$4)", id, q.user["id"], q.user["team_id"], q.s.Now()); e != nil {
		return response{}, e
	}
	if e = q.exec("INSERT INTO app.task_brief_versions(brief_id,version,state,content,content_hash,created_at) VALUES ($1,1,'draft',$2::jsonb,$3,$4)", id, string(encode(content)), digest(encode(content)), q.s.Now()); e != nil {
		return response{}, e
	}
	return q.briefResponse(id, 201)
}

func (q *request) touchBrief(b Object) error {
	return q.exec("UPDATE app.task_briefs SET revision=revision+1,updated_at=$2 WHERE id=$1", b["id"], q.s.Now())
}

func saveDraft(q *request) (response, error) {
	b, e := q.brief(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if num(b["revision"]) != num(q.body["expected_revision"]) || b["archived_at"] != nil {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	content, e := q.briefContent(q.body["content"])
	if e != nil {
		return response{}, e
	}
	raw, hash := string(encode(content)), digest(encode(content))
	tag, e := q.tx.Exec(q.Context, "UPDATE app.task_brief_versions SET content=$2::jsonb,content_hash=$3 WHERE brief_id=$1 AND state='draft'", b["id"], raw, hash)
	if e != nil {
		return response{}, e
	}
	if tag.RowsAffected() == 0 {
		// The published text stays immutable; the correction becomes the next version.
		if e = q.exec("INSERT INTO app.task_brief_versions(brief_id,version,state,content,content_hash,created_at) SELECT $1,max(version)+1,'draft',$2::jsonb,$3,$4 FROM app.task_brief_versions WHERE brief_id=$1", b["id"], raw, hash, q.s.Now()); e != nil {
			return response{}, e
		}
	}
	if e = q.touchBrief(b); e != nil {
		return response{}, e
	}
	return q.briefResponse(str(b["id"]), 200)
}

func publishBrief(q *request) (response, error) {
	b, e := q.brief(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if num(b["revision"]) != num(q.body["expected_revision"]) || b["archived_at"] != nil {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	var version int
	if e = q.tx.QueryRow(q.Context, "UPDATE app.task_brief_versions SET state='published',published_at=$2,published_by=$3 WHERE brief_id=$1 AND state='draft' RETURNING version", b["id"], q.s.Now(), q.user["id"]).Scan(&version); e != nil {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	if e = q.touchBrief(b); e != nil {
		return response{}, e
	}
	if e = q.taskEvent("brief_published", "go_task_workflow", "task_brief", str(b["id"]), Object{"brief_id": b["id"], "brief_version": version}); e != nil {
		return response{}, e
	}
	return q.briefResponse(str(b["id"]), 200)
}

func archiveBrief(q *request) (response, error) {
	b, e := q.brief(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if num(b["revision"]) != num(q.body["expected_revision"]) || b["archived_at"] != nil {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	if e = q.exec("UPDATE app.task_briefs SET archived_at=$2 WHERE id=$1", b["id"], q.s.Now()); e != nil {
		return response{}, e
	}
	if e = q.touchBrief(b); e != nil {
		return response{}, e
	}
	if e = q.taskEvent("brief_archived", "go_task_workflow", "task_brief", str(b["id"]), Object{"brief_id": b["id"]}); e != nil {
		return response{}, e
	}
	return q.briefResponse(str(b["id"]), 200)
}

func (q *request) publishedVersion(brief any, version any) (bool, error) {
	var yes bool
	e := q.tx.QueryRow(q.Context, "SELECT EXISTS(SELECT 1 FROM app.task_brief_versions WHERE brief_id=$1 AND version=$2 AND state='published')", brief, version).Scan(&yes)
	return yes, e
}

func createAssignment(q *request) (response, error) {
	b, e := q.brief(str(q.body["brief_id"]))
	if e != nil {
		return response{}, e
	}
	if b["archived_at"] != nil {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	published, e := q.publishedVersion(b["id"], q.body["brief_version"])
	if e != nil {
		return response{}, e
	}
	if !published {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	intern, e := q.one(userSQL, q.body["intern_id"])
	if e != nil {
		return response{}, e
	}
	if !has(intern["roles"], "intern") || intern["team_id"] != b["team_id"] || intern["id"] == q.user["id"] {
		return response{}, fail(404, "NOT_FOUND")
	}
	id := uuid()
	tag, e := q.tx.Exec(q.Context, "INSERT INTO app.task_assignments(id,brief_id,brief_version,intern_id,assigned_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6) ON CONFLICT (brief_id,intern_id) DO NOTHING", id, b["id"], q.body["brief_version"], intern["id"], q.user["id"], q.s.Now())
	if e != nil {
		return response{}, e
	}
	if tag.RowsAffected() == 0 {
		// Return the pinned assignment; adopting a successor remains explicit.
		a, err := q.one("SELECT jsonb_build_object('id',id) FROM app.task_assignments WHERE brief_id=$1 AND intern_id=$2", b["id"], intern["id"])
		if err != nil {
			return response{}, err
		}
		assignment, err := q.assignment(str(a["id"]))
		if err != nil {
			return response{}, err
		}
		dto, err := q.assignmentDTO(assignment)
		return created3("TaskAssignment", dto), err
	}
	if e = q.touchBrief(b); e != nil {
		return response{}, e
	}
	if e = q.taskEvent("task_assigned", "go_task_workflow", "task_assignment", id, Object{"brief_id": b["id"], "brief_version": q.body["brief_version"], "assignment_id": id}); e != nil {
		return response{}, e
	}
	if e = q.openExposure(id, str(intern["id"]), str(b["id"]), num(q.body["brief_version"]), "assigned"); e != nil {
		return response{}, e
	}
	a, e := q.assignment(id)
	if e != nil {
		return response{}, e
	}
	dto, e := q.assignmentDTO(a)
	return created3("TaskAssignment", dto), e
}

// assignment is visible to its intern and to the brief owner, both in the brief's current team.
func (q *request) assignment(id string) (Object, error) {
	a, e := q.one("SELECT to_jsonb(a)||jsonb_build_object('owner_id',b.owner_id,'team_id',b.team_id,'archived',b.archived_at IS NOT NULL,'content',v.content) FROM app.task_assignments a JOIN app.task_briefs b ON b.id=a.brief_id JOIN app.task_brief_versions v ON v.brief_id=a.brief_id AND v.version=a.brief_version WHERE a.id=$1 FOR UPDATE OF a", id)
	if e != nil {
		return nil, e
	}
	if q.user["team_id"] != a["team_id"] {
		return nil, fail(404, "NOT_FOUND")
	}
	own := a["intern_id"] == q.user["id"] && has(q.user["roles"], "intern")
	author := a["owner_id"] == q.user["id"] && has(q.user["roles"], "buddy")
	if !own && !author {
		return nil, fail(404, "NOT_FOUND")
	}
	a["viewer_is_intern"] = own
	return a, nil
}

func (q *request) assignmentDTO(a Object) (Object, error) {
	content, err := q.visibleBriefContent(a["content"])
	if err != nil {
		return nil, err
	}
	var latest int
	if e := q.tx.QueryRow(q.Context, "SELECT max(version) FROM app.task_brief_versions WHERE brief_id=$1 AND state='published'", a["brief_id"]).Scan(&latest); e != nil {
		return nil, e
	}
	people, e := q.many("SELECT jsonb_build_object('id',id,'display_name',display_name) FROM app.users WHERE id IN ($1,$2) ORDER BY (id=$1) DESC", a["intern_id"], a["owner_id"])
	if e != nil {
		return nil, e
	}
	intern, author := obj(people[0]), obj(people[len(people)-1])
	// Who marked what stays private: the author never sees per-intern marks, only the aggregate report.
	reported := []any{}
	if a["viewer_is_intern"] == true {
		reported, e = q.many("SELECT jsonb_build_object('section_id',section_id,'reason',reason) FROM app.task_frictions WHERE assignment_id=$1 AND brief_version=$2 AND intern_id=$3 ORDER BY section_id,reason", a["id"], a["brief_version"], q.user["id"])
		if e != nil {
			return nil, e
		}
	}
	state := "published"
	if a["archived"] == true {
		state = "archived"
	}
	return Object{"id": a["id"], "brief_id": a["brief_id"], "brief_version": a["brief_version"], "brief_state": state, "latest_published_version": latest, "content": content, "intern": intern, "author": author, "reported_sections": reported, "verification": "not_verified", "revision": a["revision"], "created_at": a["created_at"], "updated_at": a["updated_at"]}, nil
}

func listAssignments(q *request) (response, error) {
	rows, e := q.many("SELECT jsonb_build_object('id',a.id) FROM app.task_assignments a JOIN app.task_briefs b ON b.id=a.brief_id WHERE a.intern_id=$1 OR b.owner_id=$1 ORDER BY a.created_at DESC,a.id LIMIT 100", q.user["id"])
	if e != nil {
		return response{}, e
	}
	items := []any{}
	for _, row := range rows {
		a, e := q.assignment(str(obj(row)["id"]))
		if e != nil {
			continue
		}
		dto, e := q.assignmentDTO(a)
		if e != nil {
			return response{}, e
		}
		items = append(items, dto)
	}
	return out3("TaskAssignmentList", Object{"items": items}), nil
}

func getAssignment(q *request) (response, error) {
	a, e := q.assignment(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	dto, e := q.assignmentDTO(a)
	return out3("TaskAssignment", dto), e
}

func adoptVersion(q *request) (response, error) {
	a, e := q.assignment(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	target := num(q.body["brief_version"])
	if num(a["revision"]) != num(q.body["expected_revision"]) || a["archived"] == true || target <= num(a["brief_version"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	published, e := q.publishedVersion(a["brief_id"], target)
	if e != nil {
		return response{}, e
	}
	if !published {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	// Only the pinned text changes: goals, evidence and permissions are untouched.
	if e = q.exec("UPDATE app.task_assignments SET brief_version=$2,revision=revision+1,updated_at=$3 WHERE id=$1", a["id"], target, q.s.Now()); e != nil {
		return response{}, e
	}
	if e = q.taskEvent("task_assignment_adopted", "go_task_workflow", "task_assignment", str(a["id"]), Object{"assignment_id": a["id"], "brief_id": a["brief_id"], "brief_version": target}); e != nil {
		return response{}, e
	}
	if e = q.closeExposure(str(a["id"]), "adopted"); e != nil {
		return response{}, e
	}
	if e = q.openExposure(str(a["id"]), str(a["intern_id"]), str(a["brief_id"]), target, "adopted"); e != nil {
		return response{}, e
	}
	a, e = q.assignment(str(a["id"]))
	if e != nil {
		return response{}, e
	}
	dto, e := q.assignmentDTO(a)
	return out3("TaskAssignment", dto), e
}

// Preview is scoped through the assignment, including when the viewer is its intern.
func previewAssignmentVersion(q *request) (response, error) {
	a, e := q.assignment(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	v, e := q.one("SELECT jsonb_strip_nulls(to_jsonb(v)-'published_by') FROM app.task_brief_versions v WHERE brief_id=$1 AND state='published' ORDER BY version DESC LIMIT 1", a["brief_id"])
	if e != nil {
		return response{}, e
	}
	content, e := q.visibleBriefContent(v["content"])
	if e != nil {
		return response{}, e
	}
	v["content"] = content
	return out3("TaskBriefVersion", v), nil
}

func (q *request) visibleBriefContent(raw any) (Object, error) {
	c := clone(raw)
	refs := []any{}
	for _, ref := range list(c["refs"]) {
		yes, e := q.canRead(str(obj(ref)["document_id"]), q.user)
		if e != nil {
			return nil, e
		}
		if yes {
			refs = append(refs, ref)
		}
	}
	c["refs"] = refs
	return c, nil
}
