package api

import (
	"encoding/base64"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Goal cards: one summary per own goal with Go-computed progress. Steps are loaded by the
// existing GET /api/v2/goals/{id} when a card is expanded, so there is one source of truth.

const goalPageSize = 20

func (s *Server) goalRoutes(m *http.ServeMux) {
	s.route(m, "GET /api/v3/goals", "", "intern", false, listGoalSummaries)
}

// queryParams accepts only allowlisted query keys, each at most once.
func queryParams(q *request, allowed ...string) (map[string]string, error) {
	values := q.r.URL.Query()
	result := map[string]string{}
	for key, v := range values {
		if len(v) != 1 || !has(toAny(allowed), key) {
			return nil, fail(422, "VALIDATION_ERROR")
		}
		result[key] = v[0]
	}
	return result, nil
}

func toAny(items []string) []any {
	result := []any{}
	for _, v := range items {
		result = append(result, v)
	}
	return result
}

// The cursor is the (created_at, id) of the last returned goal: pages stay stable when
// goals are updated, and a new goal never duplicates an already shown one.
func goalCursor(created time.Time, id string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(created.UTC().Format(time.RFC3339Nano) + "|" + id))
}

func parseGoalCursor(q *request, raw string) (*time.Time, string, error) {
	data, e := base64.RawURLEncoding.DecodeString(raw)
	parts := strings.Split(string(data), "|")
	if e != nil || len(parts) != 2 || q.s.Validate("common/Uuid", parts[1]) != nil {
		return nil, "", fail(422, "VALIDATION_ERROR")
	}
	at, e := time.Parse(time.RFC3339Nano, parts[0])
	if e != nil {
		return nil, "", fail(422, "VALIDATION_ERROR")
	}
	return &at, parts[1], nil
}

func listGoalSummaries(q *request) (response, error) {
	params, e := queryParams(q, "limit", "cursor")
	if e != nil {
		return response{}, e
	}
	limit := goalPageSize
	if raw, ok := params["limit"]; ok {
		limit, e = strconv.Atoi(raw)
		if e != nil || limit < 1 || limit > goalPageSize {
			return response{}, fail(422, "VALIDATION_ERROR")
		}
	}
	var after *time.Time
	afterID := "00000000-0000-4000-8000-000000000000"
	if raw, ok := params["cursor"]; ok {
		if after, afterID, e = parseGoalCursor(q, raw); e != nil {
			return response{}, e
		}
	}
	rows, e := q.tx.Query(q.Context, "SELECT id::text,created_at FROM app.goals WHERE intern_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4", q.user["id"], after, afterID, limit+1)
	if e != nil {
		return response{}, e
	}
	type page struct {
		id      string
		created time.Time
	}
	found := []page{}
	for rows.Next() {
		var p page
		if e = rows.Scan(&p.id, &p.created); e != nil {
			rows.Close()
			return response{}, e
		}
		found = append(found, p)
	}
	rows.Close()
	if e = rows.Err(); e != nil {
		return response{}, e
	}
	var next any
	if len(found) > limit {
		found = found[:limit]
		last := found[len(found)-1]
		next = goalCursor(last.created, last.id)
	}
	items := []any{}
	for _, p := range found {
		g, t, e := q.goalCard(p.id)
		if e != nil {
			continue
		}
		items = append(items, Object{"id": g["id"], "title": t["title"], "journey_id": g["journey_id"], "journey_version": g["journey_version"], "status": g["status"], "version": g["version"], "progress": g["progress"], "step_count": len(list(g["steps"])), "updated_at": g["updated_at"]})
	}
	return out3("GoalSummaryList", Object{"items": items, "next_cursor": next}), nil
}

// goalCard reads a goal through the same path as the detail view, so a revoked grant lowers the
// progress here too. Each card runs in its own savepoint: a goal that cannot be read now is
// skipped without aborting the whole list.
func (q *request) goalCard(id string) (Object, Object, error) {
	savepoint, e := q.tx.Begin(q.Context)
	if e != nil {
		return nil, nil, e
	}
	outer := q.tx
	q.tx = savepoint
	defer func() { q.tx = outer }()
	g, e := q.publicGoal(id)
	var t Object
	if e == nil {
		t, e = q.template(g["journey_id"], g["journey_version"])
	}
	if e != nil {
		_ = savepoint.Rollback(q.Context)
		return nil, nil, e
	}
	return g, t, savepoint.Commit(q.Context)
}
