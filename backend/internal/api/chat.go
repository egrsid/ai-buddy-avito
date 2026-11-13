package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

func (s *Server) chatRoutes(m *http.ServeMux) {
	s.route(m, "POST /api/v2/conversations", "ConversationCreateRequest", "intern", true, createConversation)
	s.route(m, "GET /api/v2/conversations", "", "intern", false, listConversations)
	s.route(m, "GET /api/v2/conversations/{id}/messages", "", "intern", false, listMessages)
	s.route(m, "POST /api/v2/conversations/{id}/runs", "RunCreateRequest", "intern", true, createRun)
	s.route(m, "GET /api/v2/runs/{id}", "", "intern", false, getRun)
	s.route(m, "POST /api/v2/runs/{id}/cancel", "EmptyBody", "intern", false, cancelRun)
	m.HandleFunc("GET /api/v2/runs/{id}/events", s.stream)
	s.route(m, "GET /api/v3/conversations/{id}/message-origins", "", "intern", false, listMessageOrigins)
}

// storedOrigin is what Go saves for an assistant message. Without a report from the AI service
// the origin is "unknown"; a run that did not complete is never shown as a complete answer.
func storedOrigin(reported Object, state string) Object {
	origin := Object{"mode": "unknown", "answered_by": "unknown", "completion": "complete"}
	if reported != nil {
		origin = clone(reported)
	}
	if state != "completed" {
		origin["completion"] = "interrupted"
	}
	return origin
}

// listMessageOrigins gives the server-owned origin of each assistant message for the chat history.
func listMessageOrigins(q *request) (response, error) {
	if _, e := q.conversation(q.r.PathValue("id")); e != nil {
		return response{}, e
	}
	rows, e := q.many("SELECT jsonb_build_object('message_id',id,'run_id',run_id,'origin',origin,'status',status) FROM (SELECT id,run_id,origin,status,created_at FROM app.messages WHERE conversation_id=$1 AND role='assistant' AND run_id IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 100) m ORDER BY created_at,id", q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	items := []any{}
	for _, row := range rows {
		m := obj(row)
		var reported Object
		if m["origin"] != nil {
			reported = obj(m["origin"])
		}
		origin := storedOrigin(reported, "completed")
		if m["status"] != "completed" {
			origin["completion"] = "interrupted"
		}
		items = append(items, Object{"message_id": m["message_id"], "run_id": m["run_id"], "origin": origin})
	}
	return out3("MessageOriginList", Object{"items": items}), nil
}

const conversationJSON = `jsonb_build_object('id',id,'goal_id',goal_id,'step_id',step_id,'created_at',created_at)`

func (q *request) conversation(id string) (Object, error) {
	c, e := q.one("SELECT "+conversationJSON+" FROM app.conversations WHERE id=$1 AND intern_id=$2", id, q.user["id"])
	if e != nil {
		return nil, e
	}
	if c["goal_id"] != nil {
		g, e := q.goal(str(c["goal_id"]))
		if e != nil {
			return nil, e
		}
		if _, e = findStep(g, str(c["step_id"])); e != nil {
			return nil, e
		}
	}
	return c, nil
}
func createConversation(q *request) (response, error) {
	if q.body["goal_id"] != nil {
		g, e := q.goal(str(q.body["goal_id"]))
		if e != nil {
			return response{}, e
		}
		if _, e = findStep(g, str(q.body["step_id"])); e != nil {
			return response{}, e
		}
	}
	if e := q.exec("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", str(q.user["id"])+str(q.body["goal_id"])+str(q.body["step_id"])); e != nil {
		return response{}, e
	}
	old, e := q.many("SELECT "+conversationJSON+" FROM app.conversations WHERE intern_id=$1 AND goal_id IS NOT DISTINCT FROM $2::uuid AND step_id IS NOT DISTINCT FROM $3::text AND task_id IS NULL", q.user["id"], q.body["goal_id"], q.body["step_id"])
	if e != nil {
		return response{}, e
	}
	if len(old) > 0 {
		return out("Conversation", old[0]), nil
	}
	id := uuid()
	if e = q.exec("INSERT INTO app.conversations(id,intern_id,goal_id,step_id) VALUES ($1,$2,$3,$4)", id, q.user["id"], q.body["goal_id"], q.body["step_id"]); e != nil {
		return response{}, e
	}
	c, e := q.conversation(id)
	return created("Conversation", c), e
}
func listConversations(q *request) (response, error) {
	rows, e := q.many("SELECT "+conversationJSON+" FROM app.conversations WHERE intern_id=$1 AND task_id IS NULL ORDER BY created_at,id LIMIT 100", q.user["id"])
	if e != nil {
		return response{}, e
	}
	items := []any{}
	for _, v := range rows {
		c, e := q.conversation(str(obj(v)["id"]))
		if e == nil {
			items = append(items, c)
		}
	}
	return out("ConversationList", Object{"items": items}), nil
}
func listMessages(q *request) (response, error) {
	if _, e := q.conversation(q.r.PathValue("id")); e != nil {
		return response{}, e
	}
	rows, e := q.many("SELECT jsonb_strip_nulls(to_jsonb(m)) FROM (SELECT id,conversation_id,role,content,status,run_id,sources,created_at FROM app.messages WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100) m ORDER BY created_at,id", q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	for _, v := range rows {
		m := obj(v)
		sources, e := q.sources(m["sources"], q.user)
		if e != nil {
			sources = []any{}
			m["content"] = "Источники этого ответа больше недоступны. Запросите новый ответ с текущими правами."
		}
		m["sources"] = sources
	}
	return out("MessageList", Object{"items": rows}), nil
}

const runJSON = `jsonb_strip_nulls(jsonb_build_object('id',r.id,'conversation_id',r.conversation_id,'user_message_id',r.user_message_id,'assistant_message_id',r.assistant_message_id,'status',r.status,'error_code',r.error_code,'action_ids',COALESCE((SELECT jsonb_agg(id) FROM app.actions WHERE run_id=r.id),'[]'),'created_at',r.created_at,'updated_at',r.updated_at))`

func (q *request) run(id string) (Object, error) {
	v, e := q.one("SELECT "+runJSON+" FROM app.runs r JOIN app.conversations c ON c.id=r.conversation_id WHERE r.id=$1 AND c.intern_id=$2 FOR UPDATE OF r", id, q.user["id"])
	if e != nil {
		return nil, e
	}
	if _, e = q.conversation(str(v["conversation_id"])); e != nil {
		return nil, e
	}
	return v, nil
}
func createRun(q *request) (response, error) {
	id := q.r.PathValue("id")
	if _, e := q.conversation(id); e != nil {
		return response{}, e
	}
	if e := q.exec("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", str(q.user["id"])); e != nil {
		return response{}, e
	}
	var count int
	e := q.tx.QueryRow(q.Context, "SELECT count(*) FROM app.runs r JOIN app.conversations c ON c.id=r.conversation_id WHERE c.intern_id=$1 AND r.created_at>$2", q.user["id"], q.s.Now().Add(-time.Minute)).Scan(&count)
	if e != nil {
		return response{}, e
	}
	if count >= 5 {
		return response{}, fail(429, "RATE_LIMITED")
	}
	var active bool
	e = q.tx.QueryRow(q.Context, "SELECT EXISTS(SELECT 1 FROM app.runs WHERE conversation_id=$1 AND status IN ('queued','running'))", id).Scan(&active)
	if e != nil {
		return response{}, e
	}
	if active {
		return response{}, fail(409, "RUN_ACTIVE")
	}
	mid, rid := uuid(), uuid()
	var retry any
	if q.body["retry_of"] != nil {
		old, e := q.run(str(q.body["retry_of"]))
		if e != nil {
			return response{}, e
		}
		if old["conversation_id"] != id || old["status"] == "completed" || old["status"] == "running" || old["status"] == "queued" {
			return response{}, fail(409, "VERSION_CONFLICT")
		}
		if e = q.exec("UPDATE app.actions SET status='cancelled' WHERE run_id=$1 AND status='pending_confirmation'", old["id"]); e != nil {
			return response{}, e
		}
		mid = str(old["user_message_id"])
		retry = old["id"]
	} else {
		if e = q.exec("INSERT INTO app.messages(id,conversation_id,role,content,status) VALUES ($1,$2,'user',$3,'completed')", mid, id, clean(str(q.body["content"]))); e != nil {
			return response{}, e
		}
	}
	if e = q.exec("INSERT INTO app.runs(id,conversation_id,user_message_id,retry_of,status,created_at,updated_at) VALUES ($1,$2,$3,$4,'queued',$5,$5)", rid, id, mid, retry, q.s.Now()); e != nil {
		return response{}, e
	}
	run, e := q.run(rid)
	return created("Run", run), e
}
func getRun(q *request) (response, error) {
	if e := q.s.sweep(q.Context); e != nil {
		return response{}, e
	}
	r, e := q.run(q.r.PathValue("id"))
	return out("Run", r), e
}
func cancelRun(q *request) (response, error) {
	r, e := q.run(q.r.PathValue("id"))
	if e != nil {
		return response{}, e
	}
	if r["status"] == "queued" || r["status"] == "running" {
		if e = q.exec("UPDATE app.runs SET status='cancelled',error_code=NULL,updated_at=$2 WHERE id=$1", r["id"], q.s.Now()); e != nil {
			return response{}, e
		}
		q.s.mu.Lock()
		cancel := q.s.runs[str(r["id"])]
		q.s.mu.Unlock()
		if cancel != nil {
			cancel()
		}
	}
	r, e = q.run(str(r["id"]))
	return out("Run", r), e
}
func (s *Server) sweep(ctx context.Context) error {
	_, e := s.Pool.Exec(ctx, "UPDATE app.runs SET status='interrupted',error_code='STREAM_NOT_OPENED',updated_at=$1 WHERE status='queued' AND created_at<$2", s.Now(), s.Now().Add(-s.Config.SubscribeTimeout))
	return e
}
func (s *Server) Maintain(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	count := 0
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = s.sweep(ctx)
			count++
			if count%5 == 0 && s.reconcileMu.TryLock() {
				go func() {
					defer s.reconcileMu.Unlock()
					work, cancel := context.WithTimeout(ctx, 10*time.Second)
					defer cancel()
					_ = s.reconcilePending(work)
				}()
			}
		}
	}
}
func (q *request) generate(r Object) (Object, error) {
	c, e := q.conversation(str(r["conversation_id"]))
	if e != nil {
		return nil, e
	}
	scope, e := q.scope(q.user)
	if e != nil {
		return nil, e
	}
	messages, e := q.many("SELECT jsonb_build_object('role',role,'content',content,'sources',sources) FROM (SELECT role,content,sources,created_at,id FROM app.messages WHERE conversation_id=$1 AND (status='completed' OR id=$2) ORDER BY created_at DESC,id DESC LIMIT 20) m ORDER BY created_at,id", c["id"], r["user_message_id"])
	if e != nil {
		return nil, e
	}
	filtered := []any{}
	for _, item := range messages {
		m := obj(item)
		if m["role"] == "assistant" {
			if _, e := q.sources(m["sources"], q.user); e != nil {
				continue
			}
		}
		filtered = append(filtered, Object{"role": m["role"], "content": m["content"]})
	}
	messages = filtered
	input := Object{"run_id": r["id"], "conversation_id": c["id"], "messages": messages, "access_scope": scope, "allowed_journeys": []any{}, "allowed_tools": []any{}, "action_results": []any{}}
	if c["goal_id"] != nil {
		g, e := q.goal(str(c["goal_id"]))
		if e != nil {
			return nil, e
		}
		current, e := findStep(g, str(c["step_id"]))
		if e != nil {
			return nil, e
		}
		steps := []any{}
		for _, v := range list(g["steps"]) {
			st := obj(v)
			deps := []any{}
			for _, d := range list(st["dependencies"]) {
				deps = append(deps, obj(d)["step_id"])
			}
			ev := []any{}
			for _, item := range list(st["evidence"]) {
				a := obj(item)
				if a["invalidated_at"] == nil {
					ev = append(ev, Object{"method": a["method"], "result": a["result"], "observed_at": a["observed_at"]})
				}
			}
			blocks := []any{}
			for _, item := range list(st["blockers"]) {
				b := obj(item)
				if b["status"] == "open" {
					blocks = append(blocks, Object{"type": b["type"], "error_code": b["error_code"], "status": b["status"]})
				}
			}
			steps = append(steps, Object{"id": st["id"], "title": st["title"], "status": st["status"], "dependencies": deps, "instruction_reference": st["instruction_reference"], "evidence": ev, "blockers": blocks})
		}
		input["goal_context"] = Object{"goal_id": g["id"], "journey_id": g["journey_id"], "journey_version": g["journey_version"], "resource_id": g["resource_id"], "status": g["status"], "current_step_id": current["id"], "steps": steps, "next_actions": current["available_actions"]}
		tools := []any{}
		if has(current["available_actions"], "create_access_request") {
			tools = append(tools, "create_access_request")
		}
		if has(current["available_actions"], "escalate_to_buddy") {
			tools = append(tools, "escalate_to_buddy")
		}
		input["allowed_tools"] = tools
		actions, e := q.many("SELECT jsonb_build_object('action_id',id,'type',type,'status',status) FROM app.actions WHERE goal_id=$1 AND step_id=$2 ORDER BY created_at DESC LIMIT 5", g["id"], current["id"])
		if e != nil {
			return nil, e
		}
		input["action_results"] = actions
	}
	if q.s.Validate("ai/GenerateRequest", input) != nil {
		return nil, fail(502, "AI_SCHEMA_INVALID")
	}
	return input, nil
}

type frame struct {
	event string
	data  Object
	err   error
}

func readFrames(ctx context.Context, r io.Reader, frames chan<- frame) {
	send := func(f frame) bool {
		select {
		case frames <- f:
			return true
		case <-ctx.Done():
			return false
		}
	}
	scanner := bufio.NewScanner(io.LimitReader(r, 2*1024*1024))
	scanner.Buffer(make([]byte, 4096), 65536)
	event := ""
	data := ""
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, ":") {
			if !send(frame{event: ":ping"}) {
				return
			}
			continue
		}
		if line == "" {
			if event != "" {
				var v Object
				if json.Unmarshal([]byte(data), &v) != nil {
					send(frame{err: fail(502, "AI_SCHEMA_INVALID")})
					return
				}
				if !send(frame{event: event, data: v}) {
					return
				}
			}
			event, data = "", ""
			continue
		}
		if strings.HasPrefix(line, "event: ") {
			event = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "data: ") {
			if data != "" {
				data += "\n"
			}
			data += strings.TrimPrefix(line, "data: ")
		}
	}
	if scanner.Err() != nil || event != "" || data != "" {
		send(frame{err: fail(502, "AI_SCHEMA_INVALID")})
		return
	}
	send(frame{err: io.EOF})
}
func (s *Server) stream(w http.ResponseWriter, r *http.Request) {
	rid := uuid()
	w.Header().Set("X-Request-ID", rid)
	ctx, cancel := context.WithTimeout(r.Context(), s.Config.RunTimeout)
	defer cancel()
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		s.writeError(w, rid, e)
		return
	}
	q := &request{Context: ctx, s: s, tx: tx, r: r, requestID: rid}
	defer func() {
		if q.tx != nil {
			_ = q.tx.Rollback(context.Background())
		}
	}()
	q.user, e = q.authenticate()
	if e != nil {
		s.writeError(w, rid, e)
		return
	}
	if !has(q.user["roles"], "intern") {
		s.writeError(w, rid, fail(403, "FORBIDDEN"))
		return
	}
	id := r.PathValue("id")
	if s.Validate("common/Uuid", id) != nil {
		s.writeError(w, rid, fail(404, "NOT_FOUND"))
		return
	}
	if !strings.Contains(r.Header.Get("Accept"), "text/event-stream") {
		s.writeError(w, rid, fail(422, "VALIDATION_ERROR"))
		return
	}
	run, e := q.run(id)
	if e != nil {
		s.writeError(w, rid, e)
		return
	}
	if run["status"] != "queued" {
		s.writeError(w, rid, fail(409, "RUN_ALREADY_STARTED"))
		return
	}
	var created time.Time
	if e = q.tx.QueryRow(ctx, "SELECT created_at FROM app.runs WHERE id=$1", id).Scan(&created); e != nil {
		s.writeError(w, rid, e)
		return
	}
	if created.Add(s.Config.SubscribeTimeout).Before(s.Now()) {
		s.writeError(w, rid, fail(409, "RUN_ALREADY_STARTED"))
		return
	}
	input, e := q.generate(run)
	if e != nil {
		s.writeError(w, rid, e)
		return
	}
	if e = q.exec("UPDATE app.runs SET status='running',updated_at=$2 WHERE id=$1", id, s.Now()); e != nil {
		s.writeError(w, rid, e)
		return
	}
	s.mu.Lock()
	s.runs[id] = cancel
	s.mu.Unlock()
	defer func() { s.mu.Lock(); delete(s.runs, id); s.mu.Unlock() }()
	if e = q.tx.Commit(ctx); e != nil {
		s.writeError(w, rid, e)
		return
	}
	q.tx = nil
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(200)
	emit := func(event string, v Object) {
		_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, encode(v))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}
	emit("run.started", Object{"run_id": id})
	text := ""
	sources := []any{}
	var tool, origin Object
	errorCode := "UPSTREAM_ERROR"
	completed, started, seenSources := false, false, false
	req, _ := http.NewRequestWithContext(ctx, "POST", s.Config.AIURL+"/internal/v2/generate", bytes.NewReader(encode(input)))
	req.Header.Set("Authorization", "Bearer "+s.Config.Token)
	req.Header.Set("X-Request-ID", rid)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	// A separate transport client has no five-second JSON timeout. The run context is the hard cap.
	client := &http.Client{Transport: s.Client.Transport, CheckRedirect: s.Client.CheckRedirect}
	res, callErr := client.Do(req)
	if callErr == nil {
		defer res.Body.Close()
		if res.StatusCode != 200 || !strings.HasPrefix(res.Header.Get("Content-Type"), "text/event-stream") || res.Header.Get("X-Request-ID") != rid {
			callErr = fail(502, "UPSTREAM_ERROR")
		}
	}
	if callErr == nil {
		frames := make(chan frame)
		go readFrames(ctx, res.Body, frames)
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		idle := time.NewTimer(25 * time.Second)
		defer idle.Stop()
	streamLoop:
		for {
			select {
			case <-idle.C:
				errorCode = "UPSTREAM_TIMEOUT"
				break streamLoop
			case <-ctx.Done():
				errorCode = "UPSTREAM_TIMEOUT"
				break streamLoop
			case <-ticker.C:
				_, _ = io.WriteString(w, ": ping\n\n")
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
				}
			case f := <-frames:
				if !idle.Stop() {
					select {
					case <-idle.C:
					default:
					}
				}
				idle.Reset(25 * time.Second)
				if f.event == ":ping" {
					continue
				}
				if f.err != nil {
					if f.err == io.EOF && completed && strings.TrimSpace(text) != "" {
						errorCode = ""
					}
					break streamLoop
				}
				if completed {
					errorCode = "AI_SCHEMA_INVALID"
					break streamLoop
				}
				defs := map[string]string{"run.started": "ai/RunStartedEvent", "message.delta": "ai/MessageDeltaEvent", "message.sources": "ai/MessageSourcesEvent", "tool.proposed": "ai/ToolProposedEvent", "generation.completed": "ai/GenerationCompletedEvent", "run.failed": "ai/RunFailedEvent", "response.origin": "v3/ai/ResponseOriginEvent"}
				def := defs[f.event]
				if def == "" || s.Validate(def, f.data) != nil || f.data["run_id"] != id {
					errorCode = "AI_SCHEMA_INVALID"
					break streamLoop
				}
				if !started && f.event != "run.started" {
					errorCode = "AI_SCHEMA_INVALID"
					break streamLoop
				}
				switch f.event {
				case "run.started":
					if started {
						errorCode = "AI_SCHEMA_INVALID"
						break streamLoop
					}
					started = true
				case "message.delta":
					text += str(f.data["text"])
					if utf8.RuneCountInString(text) > 4000 {
						errorCode = "AI_SCHEMA_INVALID"
						break streamLoop
					}
					emit("message.delta", f.data)
				case "response.origin":
					if origin != nil {
						errorCode = "AI_SCHEMA_INVALID"
						break streamLoop
					}
					origin = obj(f.data["origin"])
				case "message.sources":
					if seenSources {
						errorCode = "AI_SCHEMA_INVALID"
						break streamLoop
					}
					seenSources = true
					sources = list(f.data["sources"])
				case "tool.proposed":
					if tool != nil || !has(input["allowed_tools"], str(f.data["type"])) || obj(input["goal_context"])["goal_id"] != f.data["goal_id"] || obj(input["goal_context"])["current_step_id"] != f.data["step_id"] {
						errorCode = "TOOL_VALIDATION_ERROR"
						break streamLoop
					}
					tool = f.data
				case "generation.completed":
					completed = true
				case "run.failed":
					errorCode = str(f.data["code"])
					break streamLoop
				}
			}
		}
	}
	if ctx.Err() != nil {
		errorCode = "UPSTREAM_TIMEOUT"
	}
	state := "completed"
	if errorCode != "" {
		state = "failed"
	}
	if r.Context().Err() != nil {
		state = "interrupted"
		errorCode = "CLIENT_DISCONNECTED"
	}
	terminal, err := s.finish(r.WithContext(ctx), run, q.user, state, errorCode, text, sources, tool, origin, rid)
	if err != nil {
		emit("run.failed", Object{"run_id": id, "code": "UPSTREAM_ERROR", "message": "UPSTREAM_ERROR"})
		return
	}
	// v3 clients read who answered from Go; v2 clients ignore the unknown event.
	if terminal["message_id"] != nil && terminal["origin"] != nil {
		data := Object{"run_id": id, "message_id": terminal["message_id"], "origin": terminal["origin"]}
		if s.Validate("v3/public/MessageOriginData", data) == nil {
			emit("message.origin", data)
		}
	}
	switch terminal["status"] {
	case "completed":
		if len(list(terminal["sources"])) > 0 {
			emit("message.sources", Object{"run_id": id, "sources": terminal["sources"]})
		}
		if terminal["action"] != nil {
			emit("action.proposed", Object{"run_id": id, "action": terminal["action"]})
		}
		emit("run.completed", Object{"run_id": id, "message_id": terminal["message_id"]})
	case "cancelled":
		emit("run.cancelled", Object{"run_id": id})
	default:
		emit("run.failed", Object{"run_id": id, "code": terminal["error_code"], "message": terminal["error_code"]})
	}
}
func (s *Server) finish(r *http.Request, run, user Object, state, code, text string, sources []any, tool, origin Object, rid string) (Object, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback(ctx)
	q := &request{Context: ctx, s: s, tx: tx, r: r, user: user, requestID: rid}
	current, e := q.one("SELECT "+runJSON+" FROM app.runs r JOIN app.conversations c ON c.id=r.conversation_id WHERE r.id=$1 AND c.intern_id=$2 FOR UPDATE OF r", run["id"], user["id"])
	if e != nil {
		return nil, e
	}
	if current["status"] == "cancelled" {
		state = "cancelled"
		code = ""
	}
	if current["status"] != "running" && current["status"] != "cancelled" {
		return Object{"status": current["status"], "error_code": current["error_code"]}, nil
	}
	fresh, e := q.one(userSQL, user["id"])
	if e != nil {
		return nil, e
	}
	q.user = fresh
	if state != "cancelled" {
		if _, err := q.conversation(str(run["conversation_id"])); err != nil || !has(fresh["roles"], "intern") {
			state, code = "failed", "FORBIDDEN"
		}
	}
	result := Object{"status": state, "error_code": code}
	if state == "completed" {
		for _, item := range sources {
			source := obj(item)
			id := str(source["document_id"])
			doc, e := q.knowledge(id, fresh)
			if e != nil || source["url"] != "/api/v2/knowledge/"+id || source["title"] != doc["title"] || num(source["version"]) != num(doc["version"]) || !strings.Contains(str(doc["content"]), str(source["excerpt"])) {
				state, code = "failed", "AI_SCHEMA_INVALID"
				break
			}
		}
		if state == "completed" && tool != nil {
			d := clone(tool)
			delete(d, "run_id")
			d["conversation_id"] = run["conversation_id"]
			a, e := q.draft(d, str(run["id"]))
			if e != nil {
				_ = tx.Rollback(ctx)
				return s.finish(r, run, user, "failed", "TOOL_VALIDATION_ERROR", text, nil, nil, origin, rid)
			}
			result["action"] = a
		}
	}
	if state == "completed" && r.Context().Err() != nil {
		state, code = "failed", "UPSTREAM_TIMEOUT"
	}
	if state != "completed" {
		sources = []any{}
		delete(result, "action")
	}
	result["status"], result["error_code"] = state, code
	var mid any
	if text != "" {
		mid = uuid()
		result["origin"] = storedOrigin(origin, state)
		if e = q.exec("INSERT INTO app.messages(id,conversation_id,role,content,status,run_id,sources,origin) VALUES ($1,$2,'assistant',$3,$4,$5,$6::jsonb,$7::jsonb)", mid, run["conversation_id"], text, state, run["id"], string(encode(sources)), string(encode(result["origin"]))); e != nil {
			return nil, e
		}
	}
	if state == "completed" && mid == nil {
		return nil, fail(502, "AI_SCHEMA_INVALID")
	}
	if e = q.exec("UPDATE app.runs SET status=$2,error_code=NULLIF($3,''),assistant_message_id=$4,updated_at=$5 WHERE id=$1", run["id"], state, code, mid, s.Now()); e != nil {
		return nil, e
	}
	if e = tx.Commit(ctx); e != nil {
		return nil, e
	}
	result["message_id"], result["sources"] = mid, sources
	return result, nil
}
