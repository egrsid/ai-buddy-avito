package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const resourceA = "db-team-a-test"
const docA = "0000000a-0000-4000-8000-00000000000a"
const internA = "10000000-0000-4000-8000-000000000003"
const internB = "10000000-0000-4000-8000-000000000004"
const buddyA = "10000000-0000-4000-8000-000000000001"

type fixture struct {
	t       *testing.T
	s       *Server
	admin   *pgxpool.Pool
	url     string
	mu      sync.Mutex
	grants  map[string]bool
	records map[string]Object
	mode    string
	stream  string
	mock    *httptest.Server
	ai      *httptest.Server
}
type browser struct {
	f      *fixture
	client *http.Client
	csrf   string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Fatal("Set TEST_DATABASE_URL to isolated seeded test PostgreSQL")
	}
	admin, e := pgxpool.New(context.Background(), dsn)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(admin.Config().ConnConfig.Database, "test") {
		t.Fatal("test DB name required")
	}
	t.Cleanup(admin.Close)
	_, e = admin.Exec(context.Background(), "TRUNCATE app.goals,app.conversations,app.sessions,app.idempotency_keys,app.friction_events,app.knowledge_gap_candidates CASCADE; UPDATE app.users SET policy_revision=1")
	if e != nil {
		t.Fatal(e)
	}
	cfg, e := pgxpool.ParseConfig(dsn)
	if e != nil {
		t.Fatal(e)
	}
	cfg.ConnConfig.User = "app_service"
	cfg.ConnConfig.Password = os.Getenv("TEST_APP_PASSWORD")
	pool, e := pgxpool.NewWithConfig(context.Background(), cfg)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(pool.Close)
	f := &fixture{t: t, admin: admin, grants: map[string]bool{}, records: map[string]Object{}}
	f.mock = httptest.NewServer(http.HandlerFunc(f.corporate))
	f.ai = httptest.NewServer(http.HandlerFunc(f.intelligence))
	t.Cleanup(f.mock.Close)
	t.Cleanup(f.ai.Close)
	f.s, e = New(pool, Config{Env: "test", Origin: "http://frontend.test", Token: "test-token", AIURL: f.ai.URL, MockURL: f.mock.URL, Contracts: "../../../contracts/v2", RunTimeout: 500 * time.Millisecond, SubscribeTimeout: time.Second})
	if e != nil {
		t.Fatal(e)
	}
	server := httptest.NewServer(f.s.Handler())
	f.url = server.URL
	t.Cleanup(server.Close)
	return f
}
func (f *fixture) sql(query string, args ...any) {
	f.t.Helper()
	if _, e := f.admin.Exec(context.Background(), query, args...); e != nil {
		f.t.Fatal(e)
	}
}
func (f *fixture) corporate(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	w.Header().Set("X-Request-ID", r.Header.Get("X-Request-ID"))
	if r.Header.Get("Authorization") != "Bearer test-token" {
		f.t.Error("missing service auth")
	}
	var d Object
	_ = json.NewDecoder(r.Body).Decode(&d)
	if f.mode == "unavailable" {
		w.WriteHeader(503)
		return
	}
	if strings.Contains(r.URL.Path, "access-checks") || strings.Contains(r.URL.Path, "connection-checks") {
		v := Object{"event_id": uuid(), "check_id": d["check_id"], "subject_id": d["subject_id"], "resource_id": d["resource_id"], "synthetic": true, "observed_at": stamp(time.Now())}
		if strings.Contains(r.URL.Path, "access-checks") {
			state := "absent"
			if f.grants[str(d["subject_id"])] {
				state = "present"
			}
			v["grant_state"] = state
		} else {
			v["outcome"] = "passed"
			v["safe_options"] = d["options"]
			if !f.grants[str(d["subject_id"])] {
				v["outcome"] = "failed"
				v["error_code"] = "ACCESS_DENIED"
			} else if obj(d["options"])["ssl_mode"] == "disable" {
				v["outcome"] = "failed"
				v["error_code"] = "DB_SSL_REQUIRED"
			}
		}
		if f.mode == "wrong_subject" {
			v["subject_id"] = uuid()
		}
		if f.mode == "stale" {
			v["observed_at"] = stamp(time.Now().Add(-time.Hour))
		}
		writeJSON(w, 200, v)
		return
	}
	if r.Method == "POST" && r.URL.Path == "/internal/v2/access-requests" {
		key := str(d["operation_key"])
		if f.records[key] == nil {
			f.records[key] = Object{"mock_id": uuid(), "operation_key": key, "status": "submitted", "grant_state": "absent", "synthetic": true, "subject": d["subject_id"]}
		}
		if f.mode == "lost_response" {
			w.WriteHeader(503)
			return
		}
		v := clone(f.records[key])
		delete(v, "subject")
		writeJSON(w, 201, v)
		return
	}
	var found Object
	for key, v := range f.records {
		if strings.Contains(r.URL.Path, key) || strings.Contains(r.URL.Path, str(v["mock_id"])) {
			found = v
			break
		}
	}
	if found == nil {
		w.WriteHeader(404)
		return
	}
	if strings.HasSuffix(r.URL.Path, "/decision") {
		found["status"] = d["decision"]
		if d["decision"] == "approved" {
			found["grant_state"] = "present"
			f.grants[str(found["subject"])] = true
		}
	}
	v := clone(found)
	delete(v, "subject")
	writeJSON(w, 200, v)
}
func (f *fixture) intelligence(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	stream := f.stream
	f.mu.Unlock()
	w.Header().Set("X-Request-ID", r.Header.Get("X-Request-ID"))
	if stream == "ai_unavailable" {
		w.WriteHeader(503)
		return
	}
	switch {
	case strings.Contains(r.URL.Path, "/knowledge/"):
		writeJSON(w, 200, Object{"id": docA, "title": "SSL инструкция", "content": "Используйте ssl_mode=require для тестовой БД.", "version": f.documentVersion(), "synthetic": true})
	case strings.HasSuffix(r.URL.Path, "/diagnostic-summary"):
		var d Object
		_ = json.NewDecoder(r.Body).Decode(&d)
		writeJSON(w, 200, Object{"goal": d["goal"], "step": d["step"], "blocker": d["blocker"], "checks": d["checks"], "attempted_actions": d["attempted_actions"], "instruction_refs": []any{}, "hypotheses": []any{Object{"text": "Вероятно, требуется SSL.", "confidence": "medium"}}, "question": d["intern_question"]})
	case strings.HasSuffix(r.URL.Path, "/knowledge-gap-draft"):
		var d Object
		_ = json.NewDecoder(r.Body).Decode(&d)
		if d["intern_id"] != nil {
			f.t.Error("PII in aggregate")
		}
		writeJSON(w, 200, Object{"hypothesis": "В инструкции не хватает SSL.", "proposed_fix": "Добавить ssl_mode=require после human review.", "source_refs": d["instruction_refs"]})
	case strings.HasSuffix(r.URL.Path, "/generate"):
		var d Object
		_ = json.NewDecoder(r.Body).Decode(&d)
		if stream == "revoked" {
			for _, item := range list(d["messages"]) {
				if obj(item)["role"] == "assistant" {
					f.t.Error("revoked RAG content entered subsequent prompt")
				}
			}
		}
		if f.s.Validate("ai/GenerateRequest", d) != nil {
			f.t.Error("invalid generate input")
		}
		id := str(d["run_id"])
		w.Header().Set("Content-Type", "text/event-stream")
		emit := func(event string, v Object) {
			_, _ = io.WriteString(w, "event: "+event+"\ndata: "+string(encode(v))+"\n\n")
			w.(http.Flusher).Flush()
		}
		emit("run.started", Object{"run_id": id})
		if stream == "heartbeat" {
			ticker := time.NewTicker(10 * time.Millisecond)
			defer ticker.Stop()
			for {
				select {
				case <-r.Context().Done():
					return
				case <-ticker.C:
					_, _ = io.WriteString(w, ": ping\n\n")
					w.(http.Flusher).Flush()
				}
			}
		}
		if stream == "slow" {
			<-r.Context().Done()
			return
		}
		emit("message.delta", Object{"run_id": id, "text": "Проверьте SSL."})
		if stream == "eof" {
			return
		}
		if stream == "bad_source" {
			emit("message.sources", Object{"run_id": id, "sources": []any{Object{"document_id": docA, "version": 1, "title": "SSL инструкция", "url": "https://evil.invalid", "excerpt": ""}}})
		} else {
			emit("message.sources", Object{"run_id": id, "sources": []any{Object{"document_id": docA, "version": 1, "title": "SSL инструкция", "url": "/api/v2/knowledge/" + docA, "excerpt": "ssl_mode=require"}}})
		}
		if stream == "tool" || stream == "bad_tool" {
			goal := obj(d["goal_context"])
			rid := any(resourceA)
			if stream == "bad_tool" {
				rid = "db-restricted"
			}
			emit("tool.proposed", Object{"run_id": id, "goal_id": goal["goal_id"], "step_id": goal["current_step_id"], "type": "create_access_request", "parameters": Object{"resource_id": rid, "requested_role": "db_reader", "reason": "Нужен доступ", "additional_fields": Object{}}})
		}
		emit("generation.completed", Object{"run_id": id})
		if stream == "duplicate" {
			emit("generation.completed", Object{"run_id": id})
		}
	default:
		w.WriteHeader(503)
	}
}
func (f *fixture) browser(account string) *browser {
	jar, _ := cookiejar.New(nil)
	b := &browser{f: f, client: &http.Client{Jar: jar}}
	if account != "" {
		v := b.call("POST", "/auth/demo-login", Object{"account_id": account}, 200)
		b.csrf = str(v["csrf_token"])
	}
	return b
}
func (b *browser) raw(method, path string, body any, headers map[string]string) *http.Response {
	b.f.t.Helper()
	var reader io.Reader
	if body != nil {
		reader = strings.NewReader(string(encode(body)))
	}
	req, _ := http.NewRequest(method, b.f.url+"/api/v2"+path, reader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://frontend.test")
	req.Header.Set("X-CSRF-Token", b.csrf)
	req.Header.Set("Idempotency-Key", uuid())
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, e := b.client.Do(req)
	if e != nil {
		b.f.t.Fatal(e)
	}
	return res
}
func (b *browser) call(method, path string, body any, status int) Object {
	b.f.t.Helper()
	r := b.raw(method, path, body, nil)
	defer r.Body.Close()
	raw, _ := io.ReadAll(r.Body)
	if r.StatusCode != status {
		b.f.t.Fatalf("%s %s: %d wanted %d: %s", method, path, r.StatusCode, status, raw)
	}
	v := Object{}
	if status != 204 {
		if json.Unmarshal(raw, &v) != nil {
			b.f.t.Fatal(string(raw))
		}
	}
	return v
}
func (b *browser) goal() Object {
	return b.call("POST", "/goals", Object{"journey_id": "db-access-team-a", "journey_version": 1}, 201)
}
func stepOf(g Object, sid string) Object { s, _ := findStep(g, sid); return s }
func (b *browser) check(g Object, sid, ssl string, status int) Object {
	st := stepOf(g, sid)
	options := Object{}
	if sid == "check_connection" {
		options["ssl_mode"] = ssl
	}
	return b.call("POST", "/goals/"+str(g["id"])+"/steps/"+sid+"/checks", Object{"method": st["verification_method"], "options": options, "expected_version": st["version"]}, status)
}
func (b *browser) context(g Object, sid string) Object {
	return b.call("POST", "/conversations", Object{"goal_id": g["id"], "step_id": sid}, 201)
}
func (b *browser) draft(g, c Object) Object {
	return b.call("POST", "/actions", Object{"conversation_id": c["id"], "goal_id": g["id"], "step_id": c["step_id"], "type": "create_access_request", "parameters": Object{"resource_id": resourceA, "requested_role": "db_reader", "reason": "Нужен доступ", "additional_fields": Object{}}}, 201)
}
func TestAuthAndIsolation(t *testing.T) {
	f := newFixture(t)
	anon := f.browser("")
	anon.call("GET", "/auth/me", nil, 401)
	a := f.browser("intern-a")
	a.call("GET", "/auth/me", nil, 200)
	r := a.raw("POST", "/auth/logout", Object{}, map[string]string{"Origin": "http://evil.test"})
	r.Body.Close()
	if r.StatusCode != 403 {
		t.Fatal(r.Status)
	}
	r = a.raw("POST", "/auth/logout", Object{}, map[string]string{"X-CSRF-Token": "bad"})
	r.Body.Close()
	if r.StatusCode != 403 {
		t.Fatal(r.Status)
	}
	a.call("GET", "/resources", nil, 200)
	a.call("GET", "/journeys", nil, 200)
	g := a.goal()
	a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	a.call("GET", "/goals", nil, 200)
	a.call("GET", "/goals/"+str(g["id"])+"/steps/check_access", nil, 200)
	a.call("GET", "/goals/"+str(g["id"])+"/steps/check_access/actions", nil, 200)
	f.browser("intern-b").call("GET", "/goals/"+str(g["id"]), nil, 404)
	c := f.browser("intern-c")
	c.call("GET", "/goals/"+str(g["id"]), nil, 404)
	c.call("POST", "/goals", Object{"journey_id": "db-access-team-a", "journey_version": 1}, 404)
	a.call("GET", "/goals/bad", nil, 404)
	a.call("GET", "/resources/db-restricted/access", nil, 404)
	a.call("GET", "/resources/"+resourceA+"/access", nil, 200)
	a.call("GET", "/knowledge/"+docA, nil, 200)
	a.call("GET", "/knowledge/"+uuid(), nil, 404)
	a.call("POST", "/auth/logout", Object{}, 204)
	a.call("GET", "/auth/me", nil, 401)
}
func TestAccessJourneyFeedback(t *testing.T) {
	f := newFixture(t)
	approver := f.browser("approver-a")
	buddy := f.browser("buddy-a")
	owner := f.browser("docs-owner-a")
	var candidate Object
	for _, account := range []string{"intern-a", "intern-b"} {
		a := f.browser(account)
		g := a.goal()
		if stepOf(g, "select_resource")["status"] != "verified" || stepOf(g, "check_access")["status"] != "blocked" {
			t.Fatal(g)
		}
		c := a.context(g, "check_access")
		action := a.draft(g, c)
		a.call("GET", "/actions/"+str(action["id"]), nil, 200)
		action = a.call("POST", "/actions/"+str(action["id"])+"/confirm", Object{}, 200)
		a.call("POST", "/actions/"+str(action["id"])+"/confirm", Object{}, 200)
		id := str(obj(action["result"])["access_request_id"])
		ar := approver.call("GET", "/access-requests/"+id, nil, 200)
		if ar["status"] != "submitted" || ar["grant_state"] != "absent" {
			t.Fatal(ar)
		}
		a.call("POST", "/access-requests/"+id+"/decision", Object{"decision": "approved", "reason": "ok", "expected_version": ar["version"]}, 403)
		approver.call("GET", "/access-requests", nil, 200)
		approver.call("POST", "/access-requests/"+id+"/decision", Object{"decision": "approved", "reason": "ok", "expected_version": ar["version"]}, 200)
		g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
		if stepOf(g, "check_access")["status"] == "verified" {
			t.Fatal("approval counted as check")
		}
		check := a.check(g, "check_access", "", 201)
		a.call("GET", "/checks/"+str(check["id"]), nil, 200)
		g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
		a.check(g, "check_connection", "disable", 201)
		g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
		if g["status"] != "blocked" {
			t.Fatal(g)
		}
		a.check(g, "check_connection", "disable", 201)
		g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
		if account == "intern-a" {
			if len(list(owner.call("GET", "/knowledge-gaps", nil, 200)["items"])) != 0 {
				t.Fatal("single intern reached threshold")
			}
			c = a.context(g, "check_connection")
			st := stepOf(g, "check_connection")
			snap := Object{"goal": Object{"id": g["id"], "title": "test"}, "step": Object{"id": "check_connection", "title": "test"}, "blocker": Object{"id": obj(list(st["blockers"])[0])["id"], "type": "db_ssl_required", "error_code": "DB_SSL_REQUIRED"}, "checks": []any{}, "attempted_actions": []any{}, "instruction_refs": []any{}, "hypotheses": []any{}, "question": "Как включить SSL?"}
			escAction := a.call("POST", "/actions", Object{"conversation_id": c["id"], "goal_id": g["id"], "step_id": "check_connection", "type": "escalate_to_buddy", "parameters": Object{"question": "Как включить SSL?", "diagnostic_snapshot": snap}}, 201)
			escAction = a.call("POST", "/actions/"+str(escAction["id"])+"/confirm", Object{}, 200)
			eid := str(obj(escAction["result"])["escalation_id"])
			esc := buddy.call("GET", "/escalations/"+eid, nil, 200)
			buddy.call("GET", "/escalations", nil, 200)
			f.browser("buddy-b").call("GET", "/escalations/"+eid, nil, 404)
			buddy.call("POST", "/escalations/"+eid+"/reply", Object{"answer": "Используйте ssl_mode=require", "expected_version": esc["version"]}, 200)
			g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
			if g["status"] != "blocked" {
				t.Fatal("buddy resolved technical blocker")
			}
		}
		a.check(g, "check_connection", "require", 201)
		g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
		if g["status"] != "verified" || num(obj(g["progress"])["percent"]) != 100 {
			t.Fatal(g)
		}
		items := list(owner.call("GET", "/knowledge-gaps", nil, 200)["items"])
		if len(items) > 0 {
			candidate = obj(items[0])
		}
	}
	if candidate == nil || num(candidate["affected_count"]) != 2 {
		t.Fatal(candidate)
	}
	owner.call("GET", "/friction-groups", nil, 200)
	for _, state := range []string{"under_review", "accepted", "resolved"} {
		body := Object{"decision": state, "reason": "Проверено человеком", "expected_version": candidate["version"]}
		if state == "resolved" {
			f.setStream("document_v2")
			body["resolved_reference"] = Object{"document_id": docA, "version": 2}
		}
		candidate = owner.call("POST", "/knowledge-gaps/"+str(candidate["id"])+"/review", body, 200)
	}
	owner.call("GET", "/knowledge-gaps/"+str(candidate["id"]), nil, 200)
}
func (b *browser) events(id string) string {
	r := b.raw("GET", "/runs/"+id+"/events", nil, map[string]string{"Accept": "text/event-stream"})
	defer r.Body.Close()
	raw, _ := io.ReadAll(r.Body)
	if r.StatusCode != 200 {
		b.f.t.Fatalf("events: %d %s", r.StatusCode, raw)
	}
	return string(raw)
}
func TestStreams(t *testing.T) {
	for _, mode := range []string{"normal", "eof", "bad_source", "tool", "bad_tool", "duplicate", "slow", "heartbeat"} {
		t.Run(mode, func(t *testing.T) {
			f := newFixture(t)
			f.setStream(mode)
			a := f.browser("intern-a")
			g := a.goal()
			c := a.context(g, "check_access")
			a.call("GET", "/conversations", nil, 200)
			a.call("POST", "/conversations", Object{"goal_id": g["id"], "step_id": "check_access"}, 200)
			run := a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "Что делать?"}, 201)
			a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "Ещё"}, 409)
			events := a.events(str(run["id"]))
			r := a.call("GET", "/runs/"+str(run["id"]), nil, 200)
			expected := "failed"
			if mode == "normal" || mode == "tool" {
				expected = "completed"
			}
			if r["status"] != expected {
				t.Fatalf("mode %s: %v %s", mode, r, events)
			}
			a.call("GET", "/conversations/"+str(c["id"])+"/messages", nil, 200)
			res := a.raw("GET", "/runs/"+str(run["id"])+"/events", nil, map[string]string{"Accept": "text/event-stream"})
			res.Body.Close()
			if res.StatusCode != 409 {
				t.Fatal(res.Status)
			}
			if expected == "failed" {
				if strings.Contains(events, "action.proposed") || strings.Contains(events, "message.sources") {
					t.Fatal("uncommitted data exposed")
				}
				retry := a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"retry_of": run["id"]}, 201)
				if retry["user_message_id"] != run["user_message_id"] {
					t.Fatal("retry duplicated user message")
				}
				a.call("POST", "/runs/"+str(retry["id"])+"/cancel", Object{}, 200)
			}
			if mode == "tool" && len(list(r["action_ids"])) != 1 {
				t.Fatal(r)
			}
			if mode == "normal" && !strings.Contains(events, "message.sources") {
				t.Fatal(events)
			}
		})
	}
}
func TestQueuedCancellationAndRecovery(t *testing.T) {
	f := newFixture(t)
	a := f.browser("intern-a")
	c := a.call("POST", "/conversations", Object{"goal_id": nil, "step_id": nil}, 201)
	run := a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "Привет"}, 201)
	cancel := a.call("POST", "/runs/"+str(run["id"])+"/cancel", Object{}, 200)
	if cancel["status"] != "cancelled" {
		t.Fatal(cancel)
	}
	a.call("POST", "/runs/"+str(run["id"])+"/cancel", Object{}, 200)
	run = a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "Ещё"}, 201)
	f.sql("UPDATE app.runs SET created_at=now()-interval '5 seconds' WHERE id=$1", run["id"])
	run = a.call("GET", "/runs/"+str(run["id"]), nil, 200)
	if run["status"] != "interrupted" || run["error_code"] != "STREAM_NOT_OPENED" {
		t.Fatal(run)
	}
	run = a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "После restart"}, 201)
	f.sql("UPDATE app.runs SET status='running' WHERE id=$1", run["id"])
	if e := f.s.Recover(context.Background()); e != nil {
		t.Fatal(e)
	}
	run = a.call("GET", "/runs/"+str(run["id"]), nil, 200)
	if run["status"] != "interrupted" {
		t.Fatal(run)
	}
	ctx, cancelCtx := context.WithCancel(context.Background())
	cancelCtx()
	f.s.Maintain(ctx)
}
func TestActionUnknownExpiryAndVersions(t *testing.T) {
	f := newFixture(t)
	a := f.browser("intern-a")
	g := a.goal()
	c := a.context(g, "check_access")
	draft := a.draft(g, c)
	id := str(draft["id"])
	f.setMode("lost_response")
	unknown := a.call("POST", "/actions/"+id+"/confirm", Object{}, 200)
	if unknown["status"] != "unknown" {
		t.Fatal(unknown)
	}
	f.setMode("")
	recovered := a.call("GET", "/actions/"+id, nil, 200)
	if recovered["status"] != "succeeded" || f.recordCount() != 1 {
		t.Fatal(recovered)
	}
	a.call("GET", "/access-requests", nil, 200)
	a.call("POST", "/actions/"+id+"/cancel", Object{}, 409)
	a.call("POST", "/actions", Object{"conversation_id": c["id"], "goal_id": g["id"], "step_id": "check_access", "type": "create_access_request", "parameters": Object{"resource_id": resourceA, "requested_role": "db_reader", "reason": "Duplicate", "additional_fields": Object{}}}, 409)
	approver := f.browser("approver-a")
	ar := approver.call("GET", "/access-requests/"+str(obj(recovered["result"])["access_request_id"]), nil, 200)
	approver.call("POST", "/access-requests/"+str(ar["id"])+"/decision", Object{"decision": "rejected", "reason": "test", "expected_version": ar["version"]}, 200)

	g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	draft = a.draft(g, c)
	a.call("POST", "/actions/"+str(draft["id"])+"/cancel", Object{}, 200)
	a.call("POST", "/actions/"+str(draft["id"])+"/cancel", Object{}, 200)
	draft = a.draft(g, c)
	f.sql("UPDATE app.actions SET expires_at=now()-interval '1 second' WHERE id=$1", draft["id"])
	a.call("POST", "/actions/"+str(draft["id"])+"/confirm", Object{}, 409)
	expired := a.call("GET", "/actions/"+str(draft["id"]), nil, 200)
	if expired["status"] != "expired" {
		t.Fatal(expired)
	}
	draft = a.draft(g, c)
	a.check(g, "check_access", "", 201)
	a.call("POST", "/actions/"+str(draft["id"])+"/confirm", Object{}, 409)
	a.check(g, "check_access", "", 409)
	f.browser("intern-b").call("GET", "/actions/"+id, nil, 404)
}
func TestIdempotencyAndValidation(t *testing.T) {
	f := newFixture(t)
	a := f.browser("intern-a")
	key := uuid()
	body := Object{"journey_id": "db-access-team-a", "journey_version": 1}
	r := a.raw("POST", "/goals", body, map[string]string{"Idempotency-Key": key})
	raw, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 201 {
		t.Fatal(string(raw))
	}
	r = a.raw("POST", "/goals", body, map[string]string{"Idempotency-Key": key})
	same, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if string(raw) != string(same) || r.StatusCode != 201 {
		t.Fatal(string(same))
	}
	r = a.raw("POST", "/goals", Object{"journey_id": "other", "journey_version": 1}, map[string]string{"Idempotency-Key": key})
	r.Body.Close()
	if r.StatusCode != 409 {
		t.Fatal(r.Status)
	}
	a.call("POST", "/goals", Object{"journey_id": "x", "journey_version": 1, "done": true}, 422)
	r = a.raw("POST", "/goals", body, map[string]string{"Idempotency-Key": "bad"})
	r.Body.Close()
	if r.StatusCode != 422 {
		t.Fatal(r.Status)
	}
	f.sql("UPDATE app.idempotency_keys SET expires_at=now()-interval '1 second' WHERE key=$1", key)
	r = a.raw("POST", "/goals", body, map[string]string{"Idempotency-Key": key})
	r.Body.Close()
	if r.StatusCode != 409 {
		t.Fatal(r.Status)
	}
	f.sql("UPDATE app.sessions SET expires_at=now()-interval '1 second'")
	a.call("GET", "/auth/me", nil, 401)
}
func TestUnavailableCorrelationAndRevoke(t *testing.T) {
	for _, mode := range []string{"unavailable", "wrong_subject", "stale"} {
		t.Run(mode, func(t *testing.T) {
			f := newFixture(t)
			a := f.browser("intern-a")
			f.setMode(mode)
			g := a.goal()
			st := stepOf(g, "check_access")
			if st["status"] == "verified" || len(list(st["evidence"])) != 0 {
				t.Fatal(g)
			}
			if mode == "unavailable" {
				if a.call("GET", "/resources/"+resourceA+"/access", nil, 200)["stale"] != true {
					t.Fatal("expected stale")
				}
			}
		})
	}
	f := newFixture(t)
	a := f.browser("intern-a")
	f.setGrant(internA, true)
	g := a.goal()
	a.check(g, "check_connection", "require", 201)
	g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	if g["status"] != "verified" {
		t.Fatal(g)
	}
	f.setGrant(internA, false)
	a.check(g, "check_access", "", 201)
	g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	if stepOf(g, "check_connection")["status"] != "unverified" || g["status"] == "verified" {
		t.Fatal(g)
	}
}

func (f *fixture) documentVersion() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.stream == "document_v2" {
		return 2
	}
	return 1
}
func TestRevokedScopeAndFallback(t *testing.T) {
	f := newFixture(t)
	f.setGrant(internA, true)
	f.setGrant(internB, true)
	f.setStream("ai_unavailable")
	a := f.browser("intern-a")
	g := a.goal()
	a.check(g, "check_connection", "disable", 201)
	b := f.browser("intern-b")
	gb := b.goal()
	b.check(gb, "check_connection", "disable", 201)
	owner := f.browser("docs-owner-a")
	items := list(owner.call("GET", "/knowledge-gaps", nil, 200)["items"])
	if len(items) != 1 || obj(items[0])["enrichment_status"] != "failed" {
		t.Fatal(items)
	}
	candidate := obj(items[0])
	owner.call("POST", "/knowledge-gaps/"+str(candidate["id"])+"/review", Object{"decision": "accepted", "reason": "test", "expected_version": candidate["version"]}, 409)
	owner.call("POST", "/knowledge-gaps/"+str(candidate["id"])+"/review", Object{"decision": "under_review", "reason": "test", "expected_version": 99}, 409)
	candidate = owner.call("POST", "/knowledge-gaps/"+str(candidate["id"])+"/review", Object{"decision": "under_review", "reason": "test", "expected_version": candidate["version"]}, 200)
	candidate = owner.call("POST", "/knowledge-gaps/"+str(candidate["id"])+"/review", Object{"decision": "rejected", "reason": "test", "expected_version": candidate["version"]}, 200)
	f.sql("DELETE FROM app.document_permissions WHERE subject_id=$1 AND permission='knowledge_gap.review'", "10000000-0000-4000-8000-000000000007")
	t.Cleanup(func() {
		f.sql("INSERT INTO app.document_permissions VALUES ($1,$2,'knowledge_gap.review') ON CONFLICT DO NOTHING", docA, "10000000-0000-4000-8000-000000000007")
	})
	owner.call("GET", "/knowledge-gaps/"+str(candidate["id"]), nil, 404)
	if len(list(owner.call("GET", "/knowledge-gaps", nil, 200)["items"])) != 0 {
		t.Fatal("revoked reviewer sees candidate")
	}
	f.sql("DELETE FROM app.document_permissions WHERE subject_id=$1 AND document_id=$2", internA, docA)
	t.Cleanup(func() {
		f.sql("INSERT INTO app.document_permissions VALUES ($1,$2,'knowledge.read') ON CONFLICT DO NOTHING", docA, internA)
	})
	a.call("GET", "/knowledge/"+docA, nil, 404)
	a.call("GET", "/goals/"+str(g["id"]), nil, 404)
	if len(list(a.call("GET", "/goals", nil, 200)["items"])) != 0 {
		t.Fatal("revoked instruction leaks goal")
	}
	a.call("GET", "/journeys", nil, 200)
}
func TestBoundaryErrorsAndReadiness(t *testing.T) {
	f := newFixture(t)
	for _, path := range []string{"/healthz", "/readyz"} {
		r, e := http.Get(f.url + path)
		if e != nil {
			t.Fatal(e)
		}
		r.Body.Close()
		if r.StatusCode != 200 {
			t.Fatal(r.Status)
		}
	}
	a := f.browser("intern-a")
	anon := f.browser("")
	anon.call("POST", "/auth/demo-login", Object{"account_id": "absent"}, 401)
	pc := f.s.Config
	pc.Env = "production"
	ps, e := New(f.s.Pool, pc)
	if e != nil {
		t.Fatal(e)
	}
	pw := httptest.NewServer(ps.Handler())
	defer pw.Close()
	pReq, _ := http.NewRequest("POST", pw.URL+"/api/v2/auth/demo-login", strings.NewReader(`{"account_id":"intern-a"}`))
	pReq.Header.Set("Origin", pc.Origin)
	pReq.Header.Set("Content-Type", "application/json")
	pRes, e := http.DefaultClient.Do(pReq)
	if e != nil {
		t.Fatal(e)
	}
	pRes.Body.Close()
	if pRes.StatusCode != 403 {
		t.Fatal(pRes.Status)
	}
	for _, input := range []struct {
		content, ctype string
		status         int
	}{{"{", "application/json", 400}, {"{}{}", "application/json", 400}, {"null", "application/json", 400}, {"{}", "text/plain", 400}, {strings.Repeat("x", 65537), "application/json", 400}} {
		req, _ := http.NewRequest("POST", f.url+"/api/v2/goals", strings.NewReader(input.content))
		req.Header.Set("Content-Type", input.ctype)
		req.Header.Set("Origin", "http://frontend.test")
		req.Header.Set("X-CSRF-Token", a.csrf)
		res, e := a.client.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		res.Body.Close()
		if res.StatusCode != input.status {
			t.Fatal(res.Status)
		}
	}
	f.sql("DELETE FROM app.role_assignments WHERE user_id=$1", internA)
	t.Cleanup(func() { f.sql("INSERT INTO app.role_assignments VALUES ($1,'intern') ON CONFLICT DO NOTHING", internA) })
	a.call("GET", "/auth/me", nil, 403)
	anon.call("POST", "/auth/demo-login", Object{"account_id": "intern-a"}, 403)
}
func TestTemplateIntegrity(t *testing.T) {
	f := newFixture(t)
	a := f.browser("intern-a")
	var original []byte
	if e := f.admin.QueryRow(context.Background(), "SELECT document FROM app.journey_templates LIMIT 1").Scan(&original); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		f.sql("UPDATE app.journey_templates SET document=$1::jsonb,content_hash=$2", string(original), objFrom(original)["content_hash"])
	})
	for _, mutation := range []string{"hash", "duplicate", "unknown_dep", "method"} {
		t.Run(mutation, func(t *testing.T) {
			d := objFrom(original)
			steps := list(d["steps"])
			switch mutation {
			case "hash":
				d["title"] = "tampered"
			case "duplicate":
				obj(steps[1])["id"] = "select_resource"
			case "unknown_dep":
				obj(steps[1])["dependencies"] = []any{Object{"step_id": "missing", "condition": "verified"}}
			case "method":
				obj(steps[0])["verification_method"] = "sql"
			}
			hash := d["content_hash"]
			if mutation != "hash" {
				delete(d, "content_hash")
				hash = digest(encode(d))
				d["content_hash"] = hash
			}
			f.sql("UPDATE app.journey_templates SET document=$1::jsonb,content_hash=$2", string(encode(d)), hash)
			a.call("POST", "/goals", Object{"journey_id": "db-access-team-a", "journey_version": 1}, 422)
		})
	}
}
func objFrom(raw []byte) Object { var d Object; _ = json.Unmarshal(raw, &d); return d }
func TestActiveCancellation(t *testing.T) {
	f := newFixture(t)
	f.setStream("slow")
	a := f.browser("intern-a")
	c := a.call("POST", "/conversations", Object{"goal_id": nil, "step_id": nil}, 201)
	run := a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "Привет"}, 201)
	req, _ := http.NewRequest("GET", f.url+"/api/v2/runs/"+str(run["id"])+"/events", nil)
	req.Header.Set("Accept", "text/event-stream")
	res, e := a.client.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	first := make([]byte, 20)
	_, _ = res.Body.Read(first)
	cancelled := a.call("POST", "/runs/"+str(run["id"])+"/cancel", Object{}, 200)
	_, _ = io.ReadAll(res.Body)
	res.Body.Close()
	if cancelled["status"] != "cancelled" {
		t.Fatal(cancelled)
	}
	r := a.call("GET", "/runs/"+str(run["id"]), nil, 200)
	if r["status"] != "cancelled" {
		t.Fatal(r)
	}
}

func (f *fixture) setMode(v string)           { f.mu.Lock(); defer f.mu.Unlock(); f.mode = v }
func (f *fixture) setStream(v string)         { f.mu.Lock(); defer f.mu.Unlock(); f.stream = v }
func (f *fixture) setGrant(id string, v bool) { f.mu.Lock(); defer f.mu.Unlock(); f.grants[id] = v }
func (f *fixture) recordCount() int           { f.mu.Lock(); defer f.mu.Unlock(); return len(f.records) }
func TestUnavailableDoesNotResolveBlocker(t *testing.T) {
	f := newFixture(t)
	f.setGrant(internA, true)
	a := f.browser("intern-a")
	g := a.goal()
	a.check(g, "check_connection", "disable", 201)
	g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	blockID := str(obj(list(stepOf(g, "check_connection")["blockers"])[0])["id"])
	f.setMode("unavailable")
	a.check(g, "check_connection", "require", 201)
	g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	found := false
	for _, v := range list(stepOf(g, "check_connection")["blockers"]) {
		b := obj(v)
		if b["id"] == blockID && b["status"] == "open" {
			found = true
		}
	}
	if !found {
		t.Fatal("unavailable falsely resolved SSL blocker", g)
	}
	f.setMode("")
	a.check(g, "check_access", "", 201)
	g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	a.check(g, "check_connection", "require", 201)
	g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	if g["status"] != "verified" {
		t.Fatal(g)
	}
}
func TestRecoverUnsentOperation(t *testing.T) {
	f := newFixture(t)
	a := f.browser("intern-a")
	g := a.goal()
	c := a.context(g, "check_access")
	draft := a.draft(g, c)
	f.setMode("unavailable")
	a.call("POST", "/actions/"+str(draft["id"])+"/confirm", Object{}, 200)
	a.call("POST", "/actions", Object{"conversation_id": c["id"], "goal_id": g["id"], "step_id": "check_access", "type": "create_access_request", "parameters": Object{"resource_id": resourceA, "requested_role": "db_reader", "reason": "new", "additional_fields": Object{}}}, 409)
	f.setMode("")
	f.sql("UPDATE app.actions SET status='executing',error_code=NULL WHERE id=$1", draft["id"])
	if e := f.s.Recover(context.Background()); e != nil {
		t.Fatal(e)
	}
	action := a.call("GET", "/actions/"+str(draft["id"]), nil, 200)
	if action["status"] != "succeeded" || f.recordCount() != 1 {
		t.Fatal(action)
	}
}
func TestConcurrentFrictionDedup(t *testing.T) {
	f := newFixture(t)
	f.setGrant(internA, true)
	f.setGrant(internB, true)
	a, b := f.browser("intern-a"), f.browser("intern-b")
	ga, gb := a.goal(), b.goal()
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); a.check(ga, "check_connection", "disable", 201) }()
	go func() { defer wg.Done(); b.check(gb, "check_connection", "disable", 201) }()
	wg.Wait()
	owner := f.browser("docs-owner-a")
	items := list(owner.call("GET", "/knowledge-gaps", nil, 200)["items"])
	if len(items) != 1 || num(obj(items[0])["affected_count"]) != 2 {
		t.Fatal(items)
	}
	ga = a.call("GET", "/goals/"+str(ga["id"]), nil, 200)
	a.check(ga, "check_connection", "disable", 201)
	again := list(owner.call("GET", "/knowledge-gaps", nil, 200)["items"])
	if len(again) != 1 || obj(again[0])["id"] != obj(items[0])["id"] || num(obj(again[0])["affected_count"]) != 2 {
		t.Fatal(again)
	}
}
func TestDisconnectAndRateLimit(t *testing.T) {
	f := newFixture(t)
	f.setStream("slow")
	a := f.browser("intern-a")
	c := a.call("POST", "/conversations", Object{"goal_id": nil, "step_id": nil}, 201)
	run := a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "Привет"}, 201)
	res := a.raw("GET", "/runs/"+str(run["id"])+"/events", nil, map[string]string{"Accept": "text/event-stream"})
	res.Body.Close()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		run = a.call("GET", "/runs/"+str(run["id"]), nil, 200)
		if run["status"] == "interrupted" {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if run["status"] != "interrupted" || run["error_code"] != "CLIENT_DISCONNECTED" {
		t.Fatal(run)
	}
	for i := 0; i < 4; i++ {
		r := a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "test"}, 201)
		a.call("POST", "/runs/"+str(r["id"])+"/cancel", Object{}, 200)
	}
	a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "sixth"}, 429)
}
func TestStartupFailsClosed(t *testing.T) {
	f := newFixture(t)
	for _, field := range []string{"token", "origin", "ai", "mock", "contracts", "env", "url", "credentials"} {
		c := f.s.Config
		switch field {
		case "token":
			c.Token = ""
		case "origin":
			c.Origin = ""
		case "ai":
			c.AIURL = ""
		case "mock":
			c.MockURL = ""
		case "contracts":
			c.Contracts = t.TempDir()
		case "env":
			c.Env = "unknown"
		case "url":
			c.AIURL = "://bad"
		case "credentials":
			c.MockURL = "http://user:password@localhost"
		}
		if _, e := New(f.s.Pool, c); e == nil {
			t.Fatalf("accepted invalid %s", field)
		}
	}
	c := f.s.Config
	c.Contracts = t.TempDir()
	if e := os.WriteFile(c.Contracts+"/common.schema.json", []byte("{"), 0600); e != nil {
		t.Fatal(e)
	}
	if _, e := New(f.s.Pool, c); e == nil {
		t.Fatal("invalid schema accepted")
	}
	if f.s.Validate("missing", Object{}) == nil {
		t.Fatal("missing schema accepted")
	}
	f.sql("DELETE FROM app.role_assignments WHERE user_id='10000000-0000-4000-8000-000000000007'")
	t.Cleanup(func() {
		f.sql("INSERT INTO app.role_assignments VALUES ('10000000-0000-4000-8000-000000000007','documentation_owner')")
	})
	res, e := http.Get(f.url + "/readyz")
	if e != nil {
		t.Fatal(e)
	}
	res.Body.Close()
	if res.StatusCode != 503 {
		t.Fatal(res.Status)
	}
}
func TestRevocationDuringRunPersistsTerminal(t *testing.T) {
	f := newFixture(t)
	f.setStream("slow")
	a := f.browser("intern-a")
	c := a.call("POST", "/conversations", Object{"goal_id": nil, "step_id": nil}, 201)
	run := a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "Привет"}, 201)
	res := a.raw("GET", "/runs/"+str(run["id"])+"/events", nil, map[string]string{"Accept": "text/event-stream"})
	f.sql("DELETE FROM app.role_assignments WHERE user_id=$1", internA)
	t.Cleanup(func() { f.sql("INSERT INTO app.role_assignments VALUES ($1,'intern')", internA) })
	a.call("GET", "/runs/"+str(run["id"]), nil, 403)
	_, _ = io.ReadAll(res.Body)
	res.Body.Close()
	var state, code string
	if e := f.admin.QueryRow(context.Background(), "SELECT status,error_code FROM app.runs WHERE id=$1", run["id"]).Scan(&state, &code); e != nil {
		t.Fatal(e)
	}
	if state != "failed" || code != "FORBIDDEN" {
		t.Fatal(state, code)
	}
}
func TestRevokedSourcesDoNotEnterHistoryOrPrompt(t *testing.T) {
	f := newFixture(t)
	a := f.browser("intern-a")
	c := a.call("POST", "/conversations", Object{"goal_id": nil, "step_id": nil}, 201)
	run := a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "Объясни SSL"}, 201)
	a.events(str(run["id"]))
	f.sql("DELETE FROM app.document_permissions WHERE subject_id=$1 AND document_id=$2", internA, docA)
	t.Cleanup(func() { f.sql("INSERT INTO app.document_permissions VALUES ($1,$2,'knowledge.read')", docA, internA) })
	messages := list(a.call("GET", "/conversations/"+str(c["id"])+"/messages", nil, 200)["items"])
	for _, m := range messages {
		v := obj(m)
		if v["role"] == "assistant" && (str(v["content"]) == "Проверьте SSL." || len(list(v["sources"])) != 0) {
			t.Fatal("revoked content exposed", v)
		}
	}
	f.setStream("revoked")
	run = a.call("POST", "/conversations/"+str(c["id"])+"/runs", Object{"content": "Повтори"}, 201)
	events := a.events(str(run["id"]))
	if strings.Contains(events, "message.sources") {
		t.Fatal(events)
	}
}
func TestPollingInvalidatesRevokedGrant(t *testing.T) {
	f := newFixture(t)
	f.setGrant(internA, true)
	a := f.browser("intern-a")
	g := a.goal()
	a.check(g, "check_connection", "require", 201)
	g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	if g["status"] != "verified" {
		t.Fatal(g)
	}
	version := g["version"]
	unchanged := a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	if unchanged["version"] != version {
		t.Fatal("healthy polling invalidated a preview")
	}
	f.setGrant(internA, false)
	g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	if g["status"] == "verified" || stepOf(g, "check_connection")["status"] != "unverified" {
		t.Fatal("polling retained stale verified state", g)
	}
	f.setGrant(internA, true)
	g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	if stepOf(g, "check_access")["status"] == "verified" {
		t.Fatal("polling auto-promoted a blocked step")
	}
}
func TestDualRoleCannotApproveOwnRequest(t *testing.T) {
	f := newFixture(t)
	f.sql("INSERT INTO app.role_assignments VALUES ($1,'access_approver')", internA)
	f.sql("INSERT INTO app.resource_approvers VALUES ($1,$2)", resourceA, internA)
	t.Cleanup(func() {
		f.sql("DELETE FROM app.role_assignments WHERE user_id=$1 AND role='access_approver'", internA)
		f.sql("DELETE FROM app.resource_approvers WHERE user_id=$1", internA)
	})
	a := f.browser("intern-a")
	g := a.goal()
	c := a.context(g, "check_access")
	draft := a.draft(g, c)
	action := a.call("POST", "/actions/"+str(draft["id"])+"/confirm", Object{}, 200)
	rid := str(obj(action["result"])["access_request_id"])
	request := a.call("GET", "/access-requests/"+rid, nil, 200)
	a.call("POST", "/access-requests/"+rid+"/decision", Object{"decision": "approved", "reason": "self", "expected_version": request["version"]}, 403)
	if a.call("GET", "/access-requests/"+rid, nil, 200)["status"] != "submitted" {
		t.Fatal("self approval mutated request")
	}
}
func (b *browser) keyed(method, path string, body any, key string, status int) Object {
	b.f.t.Helper()
	r := b.raw(method, path, body, map[string]string{"Idempotency-Key": key})
	defer r.Body.Close()
	raw, _ := io.ReadAll(r.Body)
	if r.StatusCode != status {
		b.f.t.Fatalf("keyed %s: %d wanted %d: %s", path, r.StatusCode, status, raw)
	}
	return objFrom(raw)
}
func TestReplayReauthorizesAction(t *testing.T) {
	f := newFixture(t)
	a := f.browser("intern-a")
	g := a.goal()
	c := a.context(g, "check_access")
	body := Object{"conversation_id": c["id"], "goal_id": g["id"], "step_id": "check_access", "type": "create_access_request", "parameters": Object{"resource_id": resourceA, "requested_role": "db_reader", "reason": "test", "additional_fields": Object{}}}
	key := uuid()
	first := a.keyed("POST", "/actions", body, key, 201)
	same := a.keyed("POST", "/actions", body, key, 201)
	if first["id"] != same["id"] {
		t.Fatal("duplicate action")
	}
	f.sql("DELETE FROM app.document_permissions WHERE subject_id=$1 AND document_id=$2", internA, docA)
	t.Cleanup(func() { f.sql("INSERT INTO app.document_permissions VALUES ($1,$2,'knowledge.read')", docA, internA) })
	a.keyed("POST", "/actions", body, key, 404)
}
func TestReplayReauthorizesReview(t *testing.T) {
	f := newFixture(t)
	f.setGrant(internA, true)
	f.setGrant(internB, true)
	for _, account := range []string{"intern-a", "intern-b"} {
		a := f.browser(account)
		g := a.goal()
		a.check(g, "check_connection", "disable", 201)
	}
	owner := f.browser("docs-owner-a")
	candidate := obj(list(owner.call("GET", "/knowledge-gaps", nil, 200)["items"])[0])
	key := uuid()
	body := Object{"decision": "under_review", "reason": "review", "expected_version": candidate["version"]}
	path := "/knowledge-gaps/" + str(candidate["id"]) + "/review"
	owner.keyed("POST", path, body, key, 200)
	owner.keyed("POST", path, body, key, 200)
	id := "10000000-0000-4000-8000-000000000007"
	f.sql("DELETE FROM app.document_permissions WHERE subject_id=$1 AND document_id=$2 AND permission='knowledge.read'", id, docA)
	t.Cleanup(func() { f.sql("INSERT INTO app.document_permissions VALUES ($1,$2,'knowledge.read')", docA, id) })
	owner.keyed("POST", path, body, key, 404)
}
func TestReplayReauthorizesBuddy(t *testing.T) {
	f := newFixture(t)
	f.setGrant(internA, true)
	a := f.browser("intern-a")
	g := a.goal()
	a.check(g, "check_connection", "disable", 201)
	g = a.call("GET", "/goals/"+str(g["id"]), nil, 200)
	c := a.context(g, "check_connection")
	block := obj(list(stepOf(g, "check_connection")["blockers"])[0])
	snapshot := Object{"goal": Object{"id": g["id"], "title": "test"}, "step": Object{"id": "check_connection", "title": "test"}, "blocker": Object{"id": block["id"], "type": block["type"], "error_code": block["error_code"]}, "checks": []any{}, "attempted_actions": []any{}, "instruction_refs": []any{}, "hypotheses": []any{}, "question": "SSL?"}
	draftBody := Object{"conversation_id": c["id"], "goal_id": g["id"], "step_id": "check_connection", "type": "escalate_to_buddy", "parameters": Object{"question": "SSL?", "diagnostic_snapshot": snapshot}}
	draftKey := uuid()
	action := a.keyed("POST", "/actions", draftBody, draftKey, 201)
	a.keyed("POST", "/actions", draftBody, draftKey, 201)
	action = a.call("POST", "/actions/"+str(action["id"])+"/confirm", Object{}, 200)
	buddy := f.browser("buddy-a")
	eid := str(obj(action["result"])["escalation_id"])
	esc := buddy.call("GET", "/escalations/"+eid, nil, 200)
	body := Object{"answer": "Use SSL", "expected_version": esc["version"]}
	key := uuid()
	path := "/escalations/" + eid + "/reply"
	buddy.keyed("POST", path, body, key, 200)
	buddy.keyed("POST", path, body, key, 200)
	f.sql("UPDATE app.users SET buddy_id='10000000-0000-4000-8000-000000000002' WHERE id=$1", internA)
	t.Cleanup(func() { f.sql("UPDATE app.users SET buddy_id=$2 WHERE id=$1", internA, buddyA) })
	buddy.keyed("POST", path, body, key, 404)
}
func TestAuthorizedReplaysPreserveResults(t *testing.T) {
	f := newFixture(t)
	a := f.browser("intern-a")
	key := uuid()
	ctx := Object{"goal_id": nil, "step_id": nil}
	c := a.keyed("POST", "/conversations", ctx, key, 201)
	if a.keyed("POST", "/conversations", ctx, key, 201)["id"] != c["id"] {
		t.Fatal("conversation duplicate")
	}
	key = uuid()
	runBody := Object{"content": "Hello"}
	path := "/conversations/" + str(c["id"]) + "/runs"
	run := a.keyed("POST", path, runBody, key, 201)
	if a.keyed("POST", path, runBody, key, 201)["id"] != run["id"] {
		t.Fatal("run duplicate")
	}
	a.call("POST", "/runs/"+str(run["id"])+"/cancel", Object{}, 200)
	g := a.goal()
	st := stepOf(g, "check_access")
	body := Object{"method": "iam_permission_present", "options": Object{}, "expected_version": st["version"]}
	path = "/goals/" + str(g["id"]) + "/steps/check_access/checks"
	key = uuid()
	check := a.keyed("POST", path, body, key, 201)
	if a.keyed("POST", path, body, key, 201)["id"] != check["id"] {
		t.Fatal("check duplicate")
	}
	c = a.context(g, "check_access")
	draft := a.draft(g, c)
	action := a.call("POST", "/actions/"+str(draft["id"])+"/confirm", Object{}, 200)
	rid := str(obj(action["result"])["access_request_id"])
	approver := f.browser("approver-a")
	req := approver.call("GET", "/access-requests/"+rid, nil, 200)
	key = uuid()
	body = Object{"decision": "approved", "reason": "reviewed", "expected_version": req["version"]}
	path = "/access-requests/" + rid + "/decision"
	approved := approver.keyed("POST", path, body, key, 200)
	again := approver.keyed("POST", path, body, key, 200)
	if digest(encode(approved)) != digest(encode(again)) {
		t.Fatal("decision replay changed result")
	}
}
