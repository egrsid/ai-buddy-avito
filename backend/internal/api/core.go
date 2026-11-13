// Package api owns application state; upstream AI only proposes and corporate is a separate service.
package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	js "github.com/santhosh-tekuri/jsonschema/v5"
)

type Object = map[string]any
type Config struct {
	Env, Origin, Token, AIURL, MockURL, Contracts string
	ContractsV3                                   string
	RunTimeout, SubscribeTimeout, EnrichTimeout   time.Duration
}
type Server struct {
	Pool        *pgxpool.Pool
	Config      Config
	schemas     map[string]*js.Schema
	Client      *http.Client
	Now         func() time.Time
	mu          sync.Mutex
	runs        map[string]context.CancelFunc
	reconcileMu sync.Mutex
}
type request struct {
	context.Context
	s         *Server
	tx        pgx.Tx
	r         *http.Request
	user      Object
	body      Object
	requestID string
	// after runs in the background once the transaction has committed (slow AI enrichment).
	after []func()
	// client overrides the short JSON client for calls allowed to take longer.
	client *http.Client
}
type response struct {
	status     int
	body       any
	definition string
}
type problem struct {
	status int
	code   string
}

func (p problem) Error() string           { return p.code }
func fail(status int, code string) error  { return problem{status, code} }
func out(def string, v any) response      { return response{200, v, "public/" + def} }
func created(def string, v any) response  { return response{201, v, "public/" + def} }
func out3(def string, v any) response     { return response{200, v, "v3/public/" + def} }
func created3(def string, v any) response { return response{201, v, "v3/public/" + def} }

// requestSchema keeps v2 request names short and lets v3 routes name "v3/public/...".
func requestSchema(definition string) string {
	if strings.HasPrefix(definition, "v3/") {
		return definition
	}
	return "public/" + definition
}
func uuid() string {
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	b[6] = b[6]&15 | 64
	b[8] = b[8]&63 | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
func randomToken() string {
	var b [32]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b[:])
}
func digest(v []byte) string { h := sha256.Sum256(v); return hex.EncodeToString(h[:]) }
func encode(v any) []byte {
	b, e := json.Marshal(v)
	if e != nil {
		panic(e)
	}
	return b
}
func obj(v any) Object { m, _ := v.(map[string]any); return m }
func str(v any) string { s, _ := v.(string); return s }
func num(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64:
		return int(n)
	case json.Number:
		i, _ := n.Int64()
		return int(i)
	}
	return 0
}
func list(v any) []any {
	if a, ok := v.([]any); ok {
		return a
	}
	return []any{}
}
func has(a any, s string) bool {
	for _, v := range list(a) {
		if v == s {
			return true
		}
	}
	return false
}
func clone(v any) Object       { var m Object; _ = json.Unmarshal(encode(v), &m); return m }
func stamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }
func (s *Server) Validate(def string, v any) error {
	schema, ok := s.schemas[def]
	if !ok {
		return fmt.Errorf("unknown schema %s", def)
	}
	var normalized any
	dec := json.NewDecoder(bytes.NewReader(encode(v)))
	dec.UseNumber()
	if e := dec.Decode(&normalized); e != nil {
		return e
	}
	return schema.Validate(normalized)
}
func New(pool *pgxpool.Pool, c Config) (*Server, error) {
	if c.Origin == "" || c.Token == "" || c.Contracts == "" || c.AIURL == "" || c.MockURL == "" {
		return nil, errors.New("origin, internal token, contracts and upstream URLs required")
	}
	for _, address := range []string{c.Origin, c.AIURL, c.MockURL} {
		u, e := url.Parse(address)
		if e != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
			return nil, errors.New("absolute HTTP origin and upstream URLs required")
		}
	}
	c.Origin = strings.TrimRight(c.Origin, "/")
	c.AIURL = strings.TrimRight(c.AIURL, "/")
	c.MockURL = strings.TrimRight(c.MockURL, "/")
	if c.Env != "local" && c.Env != "test" && c.Env != "production" {
		return nil, errors.New("invalid APP_ENV")
	}
	if c.RunTimeout == 0 {
		c.RunTimeout = 90 * time.Second
	}
	if c.SubscribeTimeout == 0 {
		c.SubscribeTimeout = 30 * time.Second
	}
	if c.EnrichTimeout == 0 {
		c.EnrichTimeout = 30 * time.Second
	}
	if c.ContractsV3 == "" {
		c.ContractsV3 = filepath.Join(filepath.Dir(filepath.Clean(c.Contracts)), "v3")
	}
	compiler := js.NewCompiler()
	compiler.AssertFormat = true
	// v2 definitions keep their historic keys ("public/Goal"); v3 additions are "v3/public/...".
	type schemaFile struct{ dir, prefix, name string }
	files := []schemaFile{}
	for _, name := range []string{"common", "public", "journey", "corporate", "ai", "events"} {
		files = append(files, schemaFile{c.Contracts, "", name})
	}
	for _, name := range []string{"public", "events", "ai"} {
		files = append(files, schemaFile{c.ContractsV3, "v3/", name})
	}
	refs := map[string]string{}
	for _, f := range files {
		data, e := os.ReadFile(filepath.Join(f.dir, f.name+".schema.json"))
		if e != nil {
			return nil, e
		}
		var doc struct {
			ID   string         `json:"$id"`
			Defs map[string]any `json:"$defs"`
		}
		if e = json.Unmarshal(data, &doc); e != nil {
			return nil, e
		}
		if e = compiler.AddResource(doc.ID, bytes.NewReader(data)); e != nil {
			return nil, e
		}
		for d := range doc.Defs {
			refs[f.prefix+f.name+"/"+d] = doc.ID + "#/$defs/" + d
		}
	}
	schemas := map[string]*js.Schema{}
	for key, ref := range refs {
		schema, e := compiler.Compile(ref)
		if e != nil {
			return nil, e
		}
		schemas[key] = schema
	}
	return &Server{Pool: pool, Config: c, schemas: schemas, Client: &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{DialContext: (&net.Dialer{Timeout: 3 * time.Second}).DialContext, TLSHandshakeTimeout: 3 * time.Second, ResponseHeaderTimeout: 5 * time.Second}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, Now: time.Now, runs: map[string]context.CancelFunc{}}, nil
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, Object{"status": "ok", "service": "backend"})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		var ready bool
		e := s.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM app.journey_templates WHERE journey_id='db-access-team-a') AND EXISTS(SELECT 1 FROM app.resource_policies) AND EXISTS(SELECT 1 FROM app.role_assignments WHERE role='documentation_owner')").Scan(&ready)
		if e != nil || !ready {
			writeJSON(w, 503, Object{"status": "not_ready", "service": "backend"})
			return
		}
		writeJSON(w, 200, Object{"status": "ok", "service": "backend"})
	})
	s.routes(mux)
	return mux
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Date", time.Now().UTC().Format(http.TimeFormat))
	w.WriteHeader(status)
	if status != 204 {
		_, _ = w.Write(encode(v))
	}
}
func (s *Server) writeError(w http.ResponseWriter, id string, e error) {
	p := problem{502, "UPSTREAM_ERROR"}
	var known problem
	if errors.As(e, &known) {
		p = known
	} else {
		log.Printf("backend operation failed request_id=%s type=%T", id, e)
	}
	writeJSON(w, p.status, Object{"error": Object{"code": p.code, "message": p.code, "request_id": id}})
}
func (s *Server) route(mux *http.ServeMux, pattern, definition string, role string, idempotent bool, fn func(*request) (response, error)) {
	mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		rid := uuid()
		w.Header().Set("X-Request-ID", rid)
		tx, e := s.Pool.Begin(r.Context())
		if e != nil {
			s.writeError(w, rid, e)
			return
		}
		defer func() { _ = tx.Rollback(context.Background()) }()
		q := &request{Context: r.Context(), s: s, tx: tx, r: r, body: Object{}, requestID: rid}
		defer func() {
			if q.tx != nil {
				_ = q.tx.Rollback(context.Background())
			}
		}()
		login := pattern == "POST /api/v2/auth/demo-login"
		if !login {
			q.user, e = q.authenticate()
			if e != nil {
				s.writeError(w, rid, e)
				return
			}
		}
		if r.Method != "GET" {
			if r.Header.Get("Origin") != s.Config.Origin {
				s.writeError(w, rid, fail(403, "FORBIDDEN"))
				return
			}
			if !login && subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(str(q.user["csrf_token"]))) != 1 {
				s.writeError(w, rid, fail(403, "CSRF_INVALID"))
				return
			}
			if r.Header.Get("Content-Type") != "application/json" && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json;") {
				s.writeError(w, rid, fail(400, "INVALID_JSON"))
				return
			}
			dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024))
			dec.UseNumber()
			if e = dec.Decode(&q.body); e != nil || q.body == nil {
				s.writeError(w, rid, fail(400, "INVALID_JSON"))
				return
			}
			var extra any
			if dec.Decode(&extra) != io.EOF {
				s.writeError(w, rid, fail(400, "INVALID_JSON"))
				return
			}
			if definition != "" && s.Validate(requestSchema(definition), q.body) != nil {
				s.writeError(w, rid, fail(422, "VALIDATION_ERROR"))
				return
			}
		}
		if role != "" && !has(q.user["roles"], role) {
			s.writeError(w, rid, fail(403, "FORBIDDEN"))
			return
		}
		for _, n := range []string{"id", "goal"} {
			if id := r.PathValue(n); id != "" && s.Validate("common/Uuid", id) != nil {
				s.writeError(w, rid, fail(404, "NOT_FOUND"))
				return
			}
		}
		var replay *response
		if idempotent {
			replay, e = q.idempotency()
			if e != nil {
				s.writeError(w, rid, e)
				return
			}
		}
		var result response
		if replay != nil {
			if e = q.authorizeReplay(pattern, replay.body); e != nil {
				s.writeError(w, rid, e)
				return
			}
			result = *replay
		} else {
			result, e = fn(q)
		}
		if e == nil && result.definition != "" {
			if s.Validate(result.definition, result.body) != nil {
				e = fail(502, "UPSTREAM_ERROR")
			}
		}
		if e != nil {
			s.writeError(w, rid, e)
			return
		}
		if idempotent && replay == nil {
			_, e = q.tx.Exec(q.Context, "UPDATE app.idempotency_keys SET response_status=$4,response=$5::jsonb WHERE user_id=$1 AND route=$2 AND key=$3", q.user["id"], r.URL.Path, r.Header.Get("Idempotency-Key"), result.status, string(encode(result.body)))
		}
		if e == nil {
			e = q.tx.Commit(q.Context)
		}
		if e != nil {
			s.writeError(w, rid, e)
			return
		}
		for _, work := range q.after {
			go work()
		}
		if login {
			cookie := result.body.(Object)["_cookie"].(string)
			delete(result.body.(Object), "_cookie")
			http.SetCookie(w, &http.Cookie{Name: "buddy_session", Value: cookie, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: r.TLS != nil || strings.HasPrefix(s.Config.Origin, "https://"), MaxAge: 28800})
		}
		if pattern == "POST /api/v2/auth/logout" {
			http.SetCookie(w, &http.Cookie{Name: "buddy_session", Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: -1})
		}
		writeJSON(w, result.status, result.body)
	})
}
func (q *request) one(sql string, args ...any) (Object, error) {
	var data []byte
	e := q.tx.QueryRow(q.Context, sql, args...).Scan(&data)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, fail(404, "NOT_FOUND")
	}
	if e != nil {
		return nil, e
	}
	var m Object
	e = json.Unmarshal(data, &m)
	normalizeTimes(m)
	return m, e
}
func (q *request) many(sql string, args ...any) ([]any, error) {
	rows, e := q.tx.Query(q.Context, sql, args...)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var raw []byte
		if e = rows.Scan(&raw); e != nil {
			return nil, e
		}
		var m Object
		if e = json.Unmarshal(raw, &m); e != nil {
			return nil, e
		}
		normalizeTimes(m)
		items = append(items, m)
	}
	return items, rows.Err()
}
func (q *request) exec(sql string, args ...any) error {
	_, e := q.tx.Exec(q.Context, sql, args...)
	return e
}
func (q *request) idempotency() (*response, error) {
	key := q.r.Header.Get("Idempotency-Key")
	if q.s.Validate("common/Uuid", key) != nil {
		return nil, fail(422, "VALIDATION_ERROR")
	}
	hash := digest(encode(q.body))
	if e := q.exec("INSERT INTO app.idempotency_keys(user_id,route,key,body_hash,expires_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", q.user["id"], q.r.URL.Path, key, hash, q.s.Now().Add(24*time.Hour)); e != nil {
		return nil, e
	}
	var old string
	var status *int
	var body []byte
	var expires time.Time
	e := q.tx.QueryRow(q.Context, "SELECT body_hash,response_status,response,expires_at FROM app.idempotency_keys WHERE user_id=$1 AND route=$2 AND key=$3 FOR UPDATE", q.user["id"], q.r.URL.Path, key).Scan(&old, &status, &body, &expires)
	if e != nil {
		return nil, e
	}
	if old != hash {
		return nil, fail(409, "IDEMPOTENCY_CONFLICT")
	}
	if status == nil {
		return nil, nil
	}
	if !expires.After(q.s.Now()) {
		return nil, fail(409, "IDEMPOTENCY_CONFLICT")
	}
	var v any
	e = json.Unmarshal(body, &v)
	return &response{*status, v, ""}, e
}

// Wire timestamps follow the reviewed UTC-second format; PostgreSQL stores full precision.
func normalizeTimes(v any) {
	switch x := v.(type) {
	case map[string]any:
		for k, value := range x {
			switch k {
			case "created_at", "updated_at", "observed_at", "invalidated_at", "expires_at", "resolved_at", "published_at", "last_seen", "last_seen_at", "first_seen":
				if parsed, e := time.Parse(time.RFC3339Nano, str(value)); e == nil {
					x[k] = stamp(parsed)
				}
			default:
				normalizeTimes(value)
			}
		}
	case []any:
		for _, value := range x {
			normalizeTimes(value)
		}
	}
}
