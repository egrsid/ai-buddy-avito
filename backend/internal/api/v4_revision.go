package api

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Go <-> Python for revision drafts follows contracts/v4/ai.schema.json (RevisionDraftRequest /
// RevisionDraftResponse). Go sends only the reported brief field with its SHA-256, re-checks every
// semantic rule of the answer and maps it to the public RevisionProposal.

const revisionAITimeout = 60 * time.Second

var stableID = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,63}$`)

var errRevisionDraft = errors.New("revision draft rejected")

// briefField is one editable brief field sent to the AI service.
type briefField struct {
	Path, Label, Text string
	Max               int
}

func (f briefField) hash() string { return digest([]byte(f.Text)) }

// reportedFields returns the brief fields the report points at: goal, expected result,
// one section text or all acceptance criteria.
func reportedFields(content Object, sectionID string) []briefField {
	out := []briefField{}
	add := func(path, label, text string, max int) {
		text = strings.TrimSpace(text)
		if text != "" && len([]rune(text)) <= max && len(out) < 6 {
			out = append(out, briefField{path, cutRunes(label, 120), text, max})
		}
	}
	switch sectionID {
	case "goal":
		add("goal", "Цель", str(content["goal"]), 2000)
	case "expected_result":
		add("expected_result", "Ожидаемый результат", str(content["expected_result"]), 2000)
	case "acceptance_criteria":
		for i, item := range list(content["acceptance_criteria"]) {
			c := obj(item)
			if id := str(c["id"]); stableID.MatchString(id) {
				add("acceptance_criteria/"+id+"/text", "Критерий приёмки "+itoa(i+1), str(c["text"]), 1000)
			}
		}
	default:
		for _, item := range list(content["sections"]) {
			s := obj(item)
			if id := str(s["id"]); id == sectionID && stableID.MatchString(id) {
				label := str(s["title"])
				if label == "" {
					label = "Раздел"
				}
				add("sections/"+id+"/text", label, str(s["text"]), 4000)
			}
		}
	}
	return out
}

// revisionDraftRequest builds RevisionDraftRequest: no intern IDs, names, chat or logs.
func revisionDraftRequest(content, report Object, fields []briefField, baseHash string) Object {
	title := cutRunes(strings.TrimSpace(str(content["title"])), 160)
	if title == "" {
		title = "Задание"
	}
	count := num(report["lifetime_count"])
	if count < 2 {
		count = 2
	}
	if count > 100 {
		count = 100
	}
	aggregate := Object{"section_id": report["section_id"], "reason": report["reason"], "affected_count": count}
	if h := cutRunes(strings.TrimSpace(str(report["hypothesis"])), 2000); h != "" {
		aggregate["hypothesis"] = h
	}
	items := []any{}
	for _, f := range fields {
		items = append(items, Object{"path": f.Path, "label": f.Label, "text": f.Text, "hash": f.hash()})
	}
	return Object{
		"brief_title": title, "base_version": num(report["brief_version"]), "base_hash": baseHash,
		"report": aggregate, "fields": items, "refs": []any{},
	}
}

// mapRevisionDraft re-checks the AI answer and maps it to the public proposal parts.
// Any broken rule rejects the whole answer, the caller then stores the manual fallback.
func mapRevisionDraft(draft Object, fields []briefField, baseHash string, baseVersion int) (status, origin string, changes, questions []any, err error) {
	if str(draft["base_hash"]) != baseHash || num(draft["base_version"]) != baseVersion {
		return "", "", nil, nil, errRevisionDraft
	}
	byPath := map[string]briefField{}
	for _, f := range fields {
		byPath[f.Path] = f
	}
	seenID, seenPath := map[string]bool{}, map[string]bool{}
	changes = []any{}
	for _, item := range list(draft["changes"]) {
		c := obj(item)
		id, path, replacement := str(c["id"]), str(c["path"]), strings.TrimSpace(str(c["replacement"]))
		f, ok := byPath[path]
		if !ok || seenID[id] || seenPath[path] || len(id) > 40 || str(c["old_hash"]) != f.hash() ||
			replacement == "" || replacement == f.Text || len([]rune(replacement)) > f.Max || strings.ContainsAny(replacement, "<>") {
			return "", "", nil, nil, errRevisionDraft
		}
		seenID[id], seenPath[path] = true, true
		change := Object{"id": id, "field": path, "old_hash": f.hash(), "replacement": replacement}
		if label := strings.TrimSpace(str(c["label"])); label != "" {
			change["label"] = cutRunes(label, 120)
		}
		if why := strings.TrimSpace(str(c["rationale"])); why != "" {
			change["rationale"] = cutRunes(why, 500)
		}
		changes = append(changes, change)
	}
	questions = []any{}
	for _, item := range list(draft["questions"]) {
		if text := strings.TrimSpace(str(obj(item)["text"])); text != "" {
			questions = append(questions, cutRunes(text, 500))
		}
	}
	switch str(draft["outcome"]) {
	case "ready":
		status = "ready"
		if len(changes) == 0 {
			return "", "", nil, nil, errRevisionDraft
		}
	case "needs_input":
		status = "needs_input"
		if len(questions) == 0 || len(changes) > 0 {
			return "", "", nil, nil, errRevisionDraft
		}
	case "no_change":
		if len(changes) > 0 || len(questions) > 0 {
			return "", "", nil, nil, errRevisionDraft
		}
		status = "needs_input"
		questions = []any{"Правок не предложено: формулировка выглядит достаточно ясной. Если стажёры всё ещё спотыкаются, опишите, где именно, и запросите черновик снова."}
	default:
		return "", "", nil, nil, errRevisionDraft
	}
	origin = "model"
	if str(obj(draft["origin"])["answered_by"]) == "offline" {
		origin = "rule_based"
	}
	return status, origin, changes, questions, nil
}

// draftRevision calls the AI service with a timeout long enough for two model attempts.
func (q *request) draftRevision(input Object) (Object, error) {
	previous := q.client
	q.client = q.s.slowClient(revisionAITimeout)
	defer func() { q.client = previous }()
	return q.call(q.s.Config.AIURL, "POST", "/internal/v4/revision-draft", "v4/ai/RevisionDraftResponse", input, nil)
}

// applyField writes one selected change into the brief content after checking the old hash.
func applyField(content Object, path string, change Object) error {
	set := func(get func() string, put func(string)) error {
		if digest([]byte(get())) != str(change["old_hash"]) {
			return fail(409, "VERSION_CONFLICT")
		}
		put(str(change["replacement"]))
		return nil
	}
	if path == "goal" || path == "expected_result" {
		return set(func() string { return str(content[path]) }, func(v string) { content[path] = v })
	}
	parts := strings.Split(path, "/")
	if len(parts) != 3 || parts[2] != "text" || (parts[0] != "sections" && parts[0] != "acceptance_criteria") {
		return fail(422, "VALIDATION_ERROR")
	}
	for _, item := range list(content[parts[0]]) {
		entry := obj(item)
		if str(entry["id"]) == parts[1] {
			return set(func() string { return str(entry["text"]) }, func(v string) { entry["text"] = v })
		}
	}
	return fail(422, "VALIDATION_ERROR")
}

func cutRunes(s string, max int) string {
	r := []rune(s)
	if len(r) > max {
		return string(r[:max])
	}
	return s
}

func itoa(n int) string { return strconv.Itoa(n) }
