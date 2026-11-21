package api

import "strings"

// The assignment row lock serializes reviews, resubmissions and adoption of a new brief version.
func (q *request) latestSubmission(a Object) (Object, error) {
	rows, err := q.many(`SELECT jsonb_strip_nulls(jsonb_build_object(
		'id',s.id,'attempt',s.attempt,'status',s.status,'conclusion',s.conclusion,'comment',s.comment,
		'evidence_id',e.id,'observed_at',e.observed_at,'submitted_at',s.submitted_at,'reviewed_at',s.reviewed_at))
		FROM app.assignment_submissions s JOIN app.evidence e ON e.id=s.evidence_id
		WHERE s.assignment_id=$1 AND s.brief_version=$2 ORDER BY s.attempt DESC LIMIT 1`, a["id"], a["brief_version"])
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	return obj(rows[0]), nil
}

// Resolve the proof from the linked goal, never from an arbitrary client-supplied check.
func (q *request) submissionProof(a Object) (Object, error) {
	links, err := q.many("SELECT jsonb_build_object('id',goal_id) FROM app.workspace_links WHERE assignment_id=$1 AND active", a["id"])
	if err != nil || len(links) == 0 {
		return nil, err
	}
	id := str(obj(links[0])["id"])
	g, err := q.publicGoal(id)
	if err != nil || g["status"] != "verified" || g["journey_id"] != a["permitted_template_id"] || num(g["journey_version"]) != num(a["permitted_template_version"]) {
		return nil, err
	}
	step, err := findStep(g, "check_connection")
	if err != nil {
		return nil, err
	}
	for _, item := range list(step["evidence"]) {
		e := obj(item)
		if step["status"] == "verified" && e["source"] == "mock_db_adapter" && e["method"] == "mock_db_connection" && e["result"] == "passed" && e["invalidated_at"] == nil {
			return Object{"id": e["id"], "observed_at": e["observed_at"]}, nil
		}
	}
	return nil, nil
}

func getSubmission(q *request) (response, error) {
	a, err := q.assignment(q.r.PathValue("id"))
	if err != nil {
		return response{}, err
	}
	last, err := q.latestSubmission(a)
	if err != nil {
		return response{}, err
	}
	var proof Object
	if a["viewer_is_intern"] == true && a["archived"] == false && a["permitted_template_id"] != nil && (last == nil || last["status"] == "returned") {
		proof, err = q.submissionProof(a)
	}
	return out4("SubmissionView", Object{"brief_version": a["brief_version"], "latest": last, "proof": proof}), err
}

func submitWork(q *request) (response, error) {
	a, err := q.assignment(q.r.PathValue("id"))
	if err != nil {
		return response{}, err
	}
	if a["viewer_is_intern"] != true || a["permitted_template_id"] == nil {
		return response{}, fail(404, "NOT_FOUND")
	}
	last, err := q.latestSubmission(a)
	if err != nil {
		return response{}, err
	}
	attempt := num(q.body["attempt"])
	if a["archived"] == true || num(a["brief_version"]) != num(q.body["brief_version"]) || attempt != num(last["attempt"])+1 || (last != nil && last["status"] != "returned") {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	text := clean(strings.TrimSpace(str(q.body["conclusion"])))
	if text == "" {
		return response{}, fail(422, "VALIDATION_ERROR")
	}
	proof, err := q.submissionProof(a)
	if err != nil {
		return response{}, err
	}
	if proof == nil || proof["id"] != q.body["evidence_id"] {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	id := uuid()
	err = q.exec(`INSERT INTO app.assignment_submissions(id,assignment_id,brief_version,attempt,evidence_id,conclusion,status,submitted_at)
		VALUES ($1,$2,$3,$4,$5,$6,'submitted',$7)`, id, a["id"], a["brief_version"], attempt, proof["id"], text, q.s.Now())
	return created4("SubmissionReceipt", Object{"id": id}), err
}

func reviewSubmission(q *request) (response, error) {
	a, err := q.assignment(q.r.PathValue("id"))
	if err != nil {
		return response{}, err
	}
	if a["owner_id"] != q.user["id"] {
		return response{}, fail(404, "NOT_FOUND")
	}
	last, err := q.latestSubmission(a)
	if err != nil {
		return response{}, err
	}
	if a["archived"] == true || last["id"] != q.body["submission_id"] || last["status"] != "submitted" {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	comment := clean(strings.TrimSpace(str(q.body["comment"])))
	if q.body["decision"] == "returned" && comment == "" {
		return response{}, fail(422, "VALIDATION_ERROR")
	}
	err = q.exec(`UPDATE app.assignment_submissions SET status=$2,comment=NULLIF($3,''),reviewed_by=$4,reviewed_at=$5
		WHERE id=$1`, last["id"], q.body["decision"], comment, q.user["id"], q.s.Now())
	return out4("SubmissionReceipt", Object{"id": last["id"]}), err
}
