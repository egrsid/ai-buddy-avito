package api

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Telegram contact of the assigned mentor. Go builds the link itself from a validated
// username; nothing is sent from the backend and no delivery status exists.

var telegramUsername = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{4,31}$`)

const previewTTL = 10 * time.Minute

var stepStatusText = map[string]string{
	"unverified":       "ещё недоступен",
	"ready":            "готов к проверке",
	"blocked":          "заблокирован",
	"waiting_external": "ждёт внешнего решения",
	"verified":         "подтверждён проверкой",
}

var checkMethodText = map[string]string{
	"resource_policy_match":  "выбор ресурса",
	"iam_permission_present": "доступ в IAM",
	"mock_db_connection":     "подключение к БД",
}

var checkStatusText = map[string]string{
	"passed":      "пройдена",
	"failed":      "не пройдена",
	"unavailable": "проверка недоступна",
}

func (s *Server) contactRoutes(m *http.ServeMux) {
	s.route(m, "GET /api/v3/me/mentor-contact", "", "intern", false, getMentorContact)
	s.route(m, "POST /api/v3/mentor-contact-preview", "v3/public/ContactPreviewRequest", "intern", false, createContactPreview)
	s.route(m, "POST /api/v3/mentor-contact-export", "v3/public/ContactExportRequest", "intern", false, exportContact)
}

type mentorInfo struct {
	user     Object
	username string
	revision int
}

func (m mentorInfo) url() string { return "https://t.me/" + m.username }

// mentor resolves the contact only from the intern's buddy assignment, never from client input.
func (q *request) mentor() (*mentorInfo, error) {
	if q.user["buddy_id"] == nil {
		return nil, nil
	}
	buddy, e := q.one(userSQL, q.user["buddy_id"])
	if e != nil {
		var p problem
		if errors.As(e, &p) && p.status == 404 {
			return nil, nil
		}
		return nil, e
	}
	if !has(buddy["roles"], "buddy") || buddy["team_id"] != q.user["team_id"] {
		return nil, nil
	}
	var username string
	var revision int
	e = q.tx.QueryRow(q.Context, "SELECT telegram_username,revision FROM app.mentor_contacts WHERE mentor_id=$1", buddy["id"]).Scan(&username, &revision)
	if e != nil {
		if errors.Is(e, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, e
	}
	if !telegramUsername.MatchString(username) {
		return nil, nil
	}
	return &mentorInfo{buddy, username, revision}, nil
}

func getMentorContact(q *request) (response, error) {
	m, e := q.mentor()
	if e != nil {
		return response{}, e
	}
	if m == nil {
		return out3("MentorContact", Object{"status": "missing"}), nil
	}
	return out3("MentorContact", Object{"status": "available", "display_name": m.user["display_name"], "telegram_url": m.url(), "contact_revision": m.revision}), nil
}

// contactText is the copyable message: the facts plus the optional AI digest that was stored
// with the preview, so the same facts give exactly the same text on export.
func (q *request) contactText(context Object, m *mentorInfo) (string, error) {
	facts, e := q.contactFacts(context, m)
	if e != nil {
		return "", e
	}
	summary := str(context["summary"])
	if summary == "" {
		return facts, nil
	}
	greeting, rest, _ := strings.Cut(facts, "\n")
	text := greeting + "\n" + summary + " (сводка ИИ)\n" + rest
	if len([]rune(text)) > 4000 {
		text = string([]rune(text)[:4000])
	}
	return text, nil
}

// contactFacts rebuilds the facts from current app state and current ACL. They contain no
// logs, raw chat, secrets, IDs of people or documents the mentor cannot read.
func (q *request) contactFacts(context Object, m *mentorInfo) (string, error) {
	lines := []string{"Здравствуйте! Нужна помощь по онбордингу."}
	refs := []any{}
	if context["kind"] == "goal" {
		g, e := q.goal(str(context["goal_id"]))
		if e != nil {
			return "", e
		}
		st, e := findStep(g, str(context["step_id"]))
		if e != nil {
			return "", e
		}
		t, e := q.template(g["journey_id"], g["journey_version"])
		if e != nil {
			return "", e
		}
		lines = append(lines, "Цель: "+str(t["title"]), "Шаг: "+str(st["title"])+" — "+stepStatusText[str(st["status"])])
		for _, v := range list(st["blockers"]) {
			b := obj(v)
			if b["status"] == "open" {
				lines = append(lines, "Блокер: "+str(b["error_code"]))
				break
			}
		}
		// Only the latest result of each check kind: repeats add nothing for the mentor.
		checks, e := q.many("SELECT jsonb_build_object('method',method,'status',status) FROM (SELECT DISTINCT ON (method) method,status,created_at FROM app.verification_checks WHERE goal_id=$1 AND step_id=$2 ORDER BY method,created_at DESC) c ORDER BY created_at DESC", g["id"], st["id"])
		if e != nil {
			return "", e
		}
		for _, v := range checks {
			c := obj(v)
			lines = append(lines, "Последняя проверка ("+checkMethodText[str(c["method"])]+"): "+checkStatusText[str(c["status"])])
		}
		refs = append(refs, st["instruction_reference"])
	} else {
		a, e := q.assignment(str(context["assignment_id"]))
		if e != nil {
			return "", e
		}
		if a["intern_id"] != q.user["id"] {
			return "", fail(404, "NOT_FOUND")
		}
		content := obj(a["content"])
		lines = append(lines, fmt.Sprintf("Задание: %s (версия %d)", str(content["title"]), num(a["brief_version"])))
		if sid := str(context["section_id"]); sid != "" {
			title, ok := sectionTitle(content, sid)
			if !ok {
				return "", fail(422, "VALIDATION_ERROR")
			}
			lines = append(lines, "Раздел: "+title)
		}
		refs = list(content["refs"])
	}
	// Only references both the intern and the mentor may read go into the text.
	for _, v := range refs {
		ref := obj(v)
		mine, e := q.canRead(str(ref["document_id"]), q.user)
		if e != nil {
			return "", e
		}
		theirs, e := q.canRead(str(ref["document_id"]), m.user)
		if e != nil {
			return "", e
		}
		if !mine || !theirs {
			continue
		}
		sources, e := q.sources([]any{Object{"document_id": ref["document_id"], "version": ref["version"]}}, q.user)
		if e != nil {
			continue
		}
		source := obj(sources[0])
		lines = append(lines, fmt.Sprintf("Инструкция: %s (версия %d)", str(source["title"]), num(source["version"])))
	}
	if question := str(context["question"]); question != "" {
		lines = append(lines, "Вопрос: "+question)
	}
	text := strings.Join(lines, "\n")
	if len([]rune(text)) > 4000 {
		text = string([]rune(text)[:4000])
	}
	return text, nil
}

func createContactPreview(q *request) (response, error) {
	m, e := q.mentor()
	if e != nil {
		return response{}, e
	}
	if m == nil {
		return response{}, fail(404, "NOT_FOUND")
	}
	context := Object{"kind": "goal", "goal_id": q.body["goal_id"], "step_id": q.body["step_id"]}
	if q.body["assignment_id"] != nil {
		context = Object{"kind": "assignment", "assignment_id": q.body["assignment_id"], "section_id": q.body["section_id"]}
	}
	if question := strings.TrimSpace(clean(str(q.body["question"]))); question != "" {
		context["question"] = question
	}
	facts, e := q.contactFacts(context, m)
	if e != nil {
		return response{}, e
	}
	if summary := q.contactSummary(facts, str(context["question"])); summary != "" {
		context["summary"] = summary
	}
	text, e := q.contactText(context, m)
	if e != nil {
		return response{}, e
	}
	id, hash, expires := uuid(), digest([]byte(text)), q.s.Now().Add(previewTTL)
	if e = q.exec("INSERT INTO app.contact_previews(id,intern_id,mentor_id,contact_revision,context,content_hash,expires_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)", id, q.user["id"], m.user["id"], m.revision, string(encode(context)), hash, expires); e != nil {
		return response{}, e
	}
	return created3("ContactPreview", Object{"id": id, "text": text, "content_hash": hash, "contact_revision": m.revision, "telegram_url": m.url(), "expires_at": stamp(expires)}), nil
}

// exportContact re-authorizes and rebuilds the text: an expired preview, a changed contact,
// changed goal state or revoked document access all give 409, and the client refreshes.
func exportContact(q *request) (response, error) {
	p, e := q.one("SELECT to_jsonb(p) FROM app.contact_previews p WHERE id=$1 AND intern_id=$2", q.body["preview_id"], q.user["id"])
	if e != nil {
		return response{}, e
	}
	expires, _ := time.Parse(time.RFC3339Nano, str(p["expires_at"]))
	if !expires.After(q.s.Now()) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	m, e := q.mentor()
	if e != nil {
		return response{}, e
	}
	if m == nil || m.user["id"] != p["mentor_id"] || m.revision != num(p["contact_revision"]) || m.revision != num(q.body["contact_revision"]) {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	text, e := q.contactText(obj(p["context"]), m)
	if e != nil {
		var known problem
		if errors.As(e, &known) && known.status == 404 {
			return response{}, fail(409, "VERSION_CONFLICT")
		}
		return response{}, e
	}
	hash := digest([]byte(text))
	if hash != p["content_hash"] || hash != q.body["content_hash"] {
		return response{}, fail(409, "VERSION_CONFLICT")
	}
	return out3("ContactExport", Object{"text": text, "telegram_url": m.url()}), nil
}

// contactSummary asks the AI service for a one-line digest of the already safe facts. It is
// optional: any failure leaves the message without it. The Telegram contact is never sent.
func (q *request) contactSummary(facts, question string) string {
	lines := []any{}
	for i, line := range strings.Split(facts, "\n") {
		if i == 0 || strings.HasPrefix(line, "Вопрос: ") || len(lines) == 12 {
			continue
		}
		runes := []rune(line)
		if len(runes) > 300 {
			runes = runes[:300]
		}
		lines = append(lines, string(runes))
	}
	if len(lines) == 0 {
		return ""
	}
	input := Object{"facts": lines}
	if question != "" {
		runes := []rune(question)
		if len(runes) > 500 {
			runes = runes[:500]
		}
		input["question"] = string(runes)
	}
	previous := q.client
	q.client = &http.Client{Transport: q.s.Client.Transport, CheckRedirect: q.s.Client.CheckRedirect, Timeout: 12 * time.Second}
	defer func() { q.client = previous }()
	draft, e := q.call(q.s.Config.AIURL, "POST", "/internal/v3/contact-summary", "v3/ai/ContactSummaryResponse", input, nil)
	if e != nil {
		return ""
	}
	summary := clean(strings.TrimSpace(str(draft["summary"])))
	lower := strings.ToLower(summary)
	if !strings.HasPrefix(summary, "Кратко:") || strings.Contains(lower, "http") || strings.Contains(lower, "t.me") {
		return ""
	}
	return summary
}
