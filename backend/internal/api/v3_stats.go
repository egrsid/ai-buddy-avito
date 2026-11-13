package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Read-only difficulty statistics. Scope (whose events) is derived on the server from the
// session before any grouping; the client chooses only period, source and page. Groups with
// fewer than two distinct interns are shown without numbers and are left out of totals and
// daily buckets, so hidden values cannot be recovered by subtraction.

const privacyThreshold = 2
const statsPageSize = 50

// Moscow has no daylight saving time; a fixed zone avoids depending on tzdata in the image.
var moscow = time.FixedZone("Europe/Moscow", 3*60*60)

func (s *Server) statisticsRoutes(m *http.ServeMux) {
	s.route(m, "GET /api/v3/statistics/mentor", "", "buddy", false, mentorStatistics)
	s.route(m, "GET /api/v3/statistics/documentation", "", "documentation_owner", false, documentationStatistics)
}

type observation struct {
	key    string
	keyObj Object
	label  string
	intern string
	item   string
	at     time.Time
}

type statGroup struct {
	keyObj  Object
	label   string
	interns map[string]bool
	items   map[string]bool
}

type statRequest struct {
	days, offset, limit int
	source              string
	from, to            time.Time
	filters             map[string]string
}

func statParams(q *request, sources ...string) (statRequest, error) {
	allowed := []string{"days", "cursor", "limit", "journey_id", "step_id", "brief_id", "brief_version", "section_id", "reason", "error_code", "document_id", "document_version", "status"}
	if len(sources) > 1 {
		allowed = append(allowed, "source")
	}
	params, e := queryParams(q, allowed...)
	if e != nil {
		return statRequest{}, e
	}
	r := statRequest{days: 30, limit: statsPageSize, source: sources[0]}
	if raw, ok := params["days"]; ok {
		if raw != "7" && raw != "30" && raw != "90" {
			return r, fail(422, "VALIDATION_ERROR")
		}
		r.days, _ = strconv.Atoi(raw)
	}
	if raw, ok := params["source"]; ok {
		if !has(toAny(sources), raw) {
			return r, fail(422, "VALIDATION_ERROR")
		}
		r.source = raw
	}
	if raw, ok := params["cursor"]; ok {
		decoded, err := base64.RawURLEncoding.DecodeString(raw)
		parts := strings.Split(string(decoded), "|")
		if err != nil || len(parts) != 2 {
			return r, fail(422, "VALIDATION_ERROR")
		}
		r.to, err = time.Parse(time.RFC3339, parts[1])
		if err != nil || r.to.After(q.s.Now()) || q.s.Now().Sub(r.to) > 24*time.Hour {
			return r, fail(422, "VALIDATION_ERROR")
		}
		if r.offset, e = strconv.Atoi(parts[0]); e != nil || r.offset < 1 || r.offset > 10000 {
			return r, fail(422, "VALIDATION_ERROR")
		}
	}
	if raw, ok := params["limit"]; ok {
		if r.limit, e = strconv.Atoi(raw); e != nil || r.limit < 1 || r.limit > statsPageSize {
			return r, fail(422, "VALIDATION_ERROR")
		}
	}
	// The window is whole Moscow calendar days ending today: [start of first day, now).
	if r.to.IsZero() {
		r.to = q.s.Now().UTC()
	}
	r.filters = map[string]string{}
	for _, key := range allowed {
		if key == "days" || key == "cursor" || key == "limit" || key == "source" {
			continue
		}
		if value, ok := params[key]; ok {
			if !regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`).MatchString(value) {
				return r, fail(422, "VALIDATION_ERROR")
			}
			r.filters[key] = value
		}
	}
	local := r.to.In(moscow)
	r.from = time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, moscow).AddDate(0, 0, -(r.days - 1)).UTC()
	return r, nil
}

func metrics(affected, observations, open int, suppressed bool) Object {
	if suppressed {
		return Object{"affected_interns": nil, "observations": nil, "open_items": nil, "suppressed": true}
	}
	return Object{"affected_interns": affected, "observations": observations, "open_items": open, "suppressed": false}
}

// aggregate turns scoped observations into rows, a total and daily buckets.
func aggregate(view string, r statRequest, list []observation, open map[string]int, related map[string][]any) Object {
	filtered := []observation{}
	for _, o := range list {
		match := true
		for key, value := range r.filters {
			if key == "status" {
				found := false
				for _, report := range related[o.key] {
					if str(obj(report)["state"]) == value {
						found = true
					}
				}
				if value == "open" {
					found = open[o.key] > 0
				}
				if value == "closed" {
					found = open[o.key] == 0
				}
				if !found {
					match = false
				}
			} else if fmt.Sprint(o.keyObj[key]) != value {
				match = false
			}
		}
		if match {
			filtered = append(filtered, o)
		}
	}
	list = filtered
	groups := map[string]*statGroup{}
	for _, o := range list {
		g := groups[o.key]
		if g == nil {
			g = &statGroup{o.keyObj, o.label, map[string]bool{}, map[string]bool{}}
			groups[o.key] = g
		}
		g.interns[o.intern] = true
		g.items[o.item] = true
	}
	keys := []string{}
	for k := range groups {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		a, b := len(groups[keys[i]].interns), len(groups[keys[j]].interns)
		if (a < privacyThreshold) != (b < privacyThreshold) {
			return b < privacyThreshold
		}
		if a != b && a >= privacyThreshold {
			return a > b
		}
		return keys[i] < keys[j]
	})
	rows := []any{}
	visible := map[string]bool{}
	openKeys := map[string]bool{}
	interns, items, openTotal, hidden := map[string]bool{}, map[string]bool{}, 0, false
	for _, k := range keys {
		g := groups[k]
		suppressed := len(g.interns) < privacyThreshold
		reports := related[k]
		if reports == nil {
			reports = []any{}
		}
		rows = append(rows, Object{"key": g.keyObj, "label": g.label, "metrics": metrics(len(g.interns), len(g.items), open[k], suppressed), "related_reports": reports})
		if suppressed {
			hidden = true
			continue
		}
		visible[k] = true
		for id := range g.interns {
			interns[id] = true
		}
		for id := range g.items {
			items[id] = true
		}
		openKey := k
		if view == "documentation" {
			openKey = str(g.keyObj["journey_id"]) + "|" + str(g.keyObj["step_id"]) + "|" + str(g.keyObj["error_code"])
		}
		if !openKeys[openKey] {
			openTotal += open[k]
			openKeys[openKey] = true
		}
	}
	// With only hidden groups the total would be a misleading zero, so it is hidden too.
	summary := metrics(len(interns), len(items), openTotal, hidden)
	daily := []any{}
	for day := 0; day < r.days; day++ {
		start := r.from.Add(time.Duration(day) * 24 * time.Hour)
		end := start.Add(24 * time.Hour)
		who, what := map[string]bool{}, map[string]bool{}
		for _, o := range list {
			if visible[o.key] && !o.at.Before(start) && o.at.Before(end) {
				who[o.intern] = true
				what[o.item] = true
			}
		}
		bucket := Object{"date": start.In(moscow).Format("2006-01-02"), "affected_interns": len(who), "observations": len(what), "suppressed": false}
		if hidden || (len(who) > 0 && len(who) < privacyThreshold) {
			bucket["affected_interns"], bucket["observations"], bucket["suppressed"] = nil, nil, true
		}
		daily = append(daily, bucket)
	}
	var next any
	if r.offset > len(rows) {
		rows = []any{}
	} else {
		rows = rows[r.offset:]
	}
	if len(rows) > r.limit {
		rows = rows[:r.limit]
		next = base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(r.offset+r.limit) + "|" + r.to.Format(time.RFC3339Nano)))
	}
	return Object{"view": view, "source_kind": r.source, "as_of": stamp(r.to), "timezone": "Europe/Moscow", "window": Object{"from": stamp(r.from), "to": stamp(r.to), "days": r.days}, "privacy_threshold": privacyThreshold, "summary": summary, "rows": rows, "daily": daily, "next_cursor": next}
}

// stepTitles reads step titles of approved journey templates for row labels.
func (q *request) stepTitle(cache map[string]string, journey string, version int, step string) (string, error) {
	key := fmt.Sprintf("%s:%d", journey, version)
	if _, ok := cache[key]; !ok {
		rows, e := q.many("SELECT jsonb_build_object('id',s->>'id','title',s->>'title') FROM app.journey_templates t, jsonb_array_elements(t.document->'steps') s WHERE t.journey_id=$1 AND t.version=$2", journey, version)
		if e != nil {
			return "", e
		}
		cache[key] = "loaded"
		for _, row := range rows {
			cache[key+":"+str(obj(row)["id"])] = str(obj(row)["title"])
		}
	}
	if title := cache[key+":"+step]; title != "" {
		return title, nil
	}
	return step, nil
}

// technical collects failed trusted checks. CHECK_UNAVAILABLE and transport failures are not
// a difficulty of the intern or of the instruction and never enter these numbers.
func (q *request) technical(r statRequest, scope string, perDocument bool) ([]observation, map[string]int, error) {
	filter := "u.buddy_id=$1 AND u.team=$2 AND EXISTS(SELECT 1 FROM app.friction_mentor_attribution a WHERE a.friction_id=f.id AND a.mentor_id=$1)"
	args := []any{q.user["id"], q.user["team_id"], r.from, r.to}
	if scope == "documentation" {
		filter = "u.team=$2 AND EXISTS(SELECT 1 FROM app.document_permissions p WHERE p.subject_id=$1 AND p.document_id=f.instruction_id AND p.permission='knowledge_gap.review') AND EXISTS(SELECT 1 FROM app.document_permissions p WHERE p.subject_id=$1 AND p.document_id=f.instruction_id AND p.permission='knowledge.read')"
	}
	rows, e := q.tx.Query(q.Context, "SELECT f.journey_id,f.journey_version,f.step_id,f.error_code,f.instruction_id::text,f.instruction_version,f.intern_id::text,f.attempt_id::text,f.occurred_at,f.goal_id::text FROM app.friction_events f JOIN app.users u ON u.id=f.intern_id JOIN app.goals g ON g.id=f.goal_id WHERE "+filter+" AND f.outcome='failed' AND f.error_code<>'CHECK_UNAVAILABLE' AND g.resource_id IN (SELECT resource_id FROM app.resource_assignments WHERE user_id=$1) AND f.occurred_at>=$3 AND f.occurred_at<$4 ORDER BY f.occurred_at", args...)
	if e != nil {
		return nil, nil, e
	}
	type raw struct {
		journey, step, code, doc, intern, attempt, goal string
		version, docVersion                             int
		at                                              time.Time
	}
	found := []raw{}
	for rows.Next() {
		var v raw
		if e = rows.Scan(&v.journey, &v.version, &v.step, &v.code, &v.doc, &v.docVersion, &v.intern, &v.attempt, &v.at, &v.goal); e != nil {
			rows.Close()
			return nil, nil, e
		}
		found = append(found, v)
	}
	rows.Close()
	if e = rows.Err(); e != nil {
		return nil, nil, e
	}
	titles := map[string]string{}
	result := []observation{}
	goalsByKey := map[string]map[string]bool{}
	for _, v := range found {
		title, e := q.stepTitle(titles, v.journey, v.version, v.step)
		if e != nil {
			return nil, nil, e
		}
		key := v.journey + "|" + v.step + "|" + v.code
		keyObj := Object{"journey_id": v.journey, "step_id": v.step, "error_code": v.code}
		label := title + " · " + v.code
		if perDocument {
			key += fmt.Sprintf("|%s|%d", v.doc, v.docVersion)
			keyObj["document_id"], keyObj["document_version"] = v.doc, v.docVersion
			label += fmt.Sprintf(" · инструкция v%d", v.docVersion)
		}
		result = append(result, observation{key, keyObj, label, v.intern, v.attempt, v.at})
		if goalsByKey[key] == nil {
			goalsByKey[key] = map[string]bool{}
		}
		goalsByKey[key][v.goal] = true
	}
	// Open blockers are the state at as_of among goals that produced the shown observations.
	open := map[string]int{}
	for key, goals := range goalsByKey {
		obs := []any{}
		for id := range goals {
			obs = append(obs, id)
		}
		var step, code string
		for _, o := range result {
			if o.key == key {
				step, code = str(o.keyObj["step_id"]), str(o.keyObj["error_code"])
				break
			}
		}
		var n int
		if e = q.tx.QueryRow(q.Context, "SELECT count(*) FROM app.blockers WHERE status='open' AND step_id=$1 AND error_code=$2 AND goal_id::text=ANY($3)", step, code, toStrings(obs)).Scan(&n); e != nil {
			return nil, nil, e
		}
		open[key] = n
	}
	return result, open, nil
}

func toStrings(items []any) []string {
	result := []string{}
	for _, v := range items {
		result = append(result, str(v))
	}
	return result
}

func (q *request) taskClarity(r statRequest) ([]observation, map[string]int, map[string][]any, error) {
	rows, e := q.tx.Query(q.Context, "SELECT f.brief_id::text,f.brief_version,f.section_id,f.reason,f.intern_id::text,f.id::text,f.first_seen,v.content->>'title' FROM app.task_frictions f JOIN app.task_briefs b ON b.id=f.brief_id AND b.owner_id=f.owner_id AND b.team_id=f.team_id JOIN app.task_brief_versions v ON v.brief_id=f.brief_id AND v.version=f.brief_version WHERE f.owner_id=$1 AND f.team_id=$2 AND f.first_seen>=$3 AND f.first_seen<$4 ORDER BY f.first_seen", q.user["id"], q.user["team_id"], r.from, r.to)
	if e != nil {
		return nil, nil, nil, e
	}
	result := []observation{}
	for rows.Next() {
		var brief, section, reason, intern, id, title string
		var version int
		var at time.Time
		if e = rows.Scan(&brief, &version, &section, &reason, &intern, &id, &at, &title); e != nil {
			rows.Close()
			return nil, nil, nil, e
		}
		key := fmt.Sprintf("%s|%d|%s|%s", brief, version, section, reason)
		keyObj := Object{"brief_id": brief, "brief_version": version, "section_id": section, "reason": reason}
		result = append(result, observation{key, keyObj, fmt.Sprintf("%s · v%d · %s · %s", title, version, section, reasonText[reason]), intern, id, at})
	}
	rows.Close()
	if e = rows.Err(); e != nil {
		return nil, nil, nil, e
	}
	// Section titles come from the pinned version, the same text the interns marked.
	for i, o := range result {
		var raw []byte
		if e = q.tx.QueryRow(q.Context, "SELECT content FROM app.task_brief_versions WHERE brief_id=$1 AND version=$2", o.keyObj["brief_id"], o.keyObj["brief_version"]).Scan(&raw); e != nil {
			return nil, nil, nil, e
		}
		content := objFromJSON(raw)
		if title, ok := sectionTitle(content, str(o.keyObj["section_id"])); ok {
			result[i].label = fmt.Sprintf("%s · v%d · %s · %s", str(content["title"]), num(o.keyObj["brief_version"]), title, reasonText[str(o.keyObj["reason"])])
		}
	}
	reports, e := q.many("SELECT jsonb_build_object('id',id,'state',state,'key',brief_id::text||'|'||brief_version||'|'||section_id||'|'||reason) FROM app.task_clarity_reports WHERE owner_id=$1 AND team_id=$2", q.user["id"], q.user["team_id"])
	if e != nil {
		return nil, nil, nil, e
	}
	open, related := map[string]int{}, map[string][]any{}
	for _, item := range reports {
		report := obj(item)
		key := str(report["key"])
		related[key] = append(related[key], Object{"id": report["id"], "kind": "task_clarity_report", "state": report["state"]})
		if report["state"] == "proposed" || report["state"] == "under_review" || report["state"] == "accepted" {
			open[key]++
		}
	}
	return result, open, related, nil
}

func mentorStatistics(q *request) (response, error) {
	r, e := statParams(q, "technical", "task_clarity")
	if e != nil {
		return response{}, e
	}
	if r.source == "task_clarity" {
		list, open, related, e := q.taskClarity(r)
		if e != nil {
			return response{}, e
		}
		return out3("Statistics", aggregate("mentor", r, list, open, related)), nil
	}
	list, open, e := q.technical(r, "mentor", false)
	if e != nil {
		return response{}, e
	}
	return out3("Statistics", aggregate("mentor", r, list, open, nil)), nil
}

func documentationStatistics(q *request) (response, error) {
	r, e := statParams(q, "technical")
	if e != nil {
		return response{}, e
	}
	list, open, e := q.technical(r, "documentation", true)
	if e != nil {
		return response{}, e
	}
	// Related candidates are listed only when the owner may review them right now.
	related := map[string][]any{}
	seen := map[string]bool{}
	for _, o := range list {
		if seen[o.key] {
			continue
		}
		seen[o.key] = true
		rows, e := q.many("SELECT jsonb_build_object('id',id) FROM app.knowledge_gap_candidates WHERE journey_id=$1 AND step_id=$2 AND error_code=$3 AND team_id=$4 ORDER BY created_at LIMIT 10", o.keyObj["journey_id"], o.keyObj["step_id"], o.keyObj["error_code"], q.user["team_id"])
		if e != nil {
			return response{}, e
		}
		for _, row := range rows {
			c, e := q.candidate(str(obj(row)["id"]))
			if e != nil {
				continue
			}
			related[o.key] = append(related[o.key], Object{"id": c["id"], "kind": "knowledge_gap_candidate", "state": c["state"]})
		}
	}
	return out3("Statistics", aggregate("documentation", r, list, open, related)), nil
}

func objFromJSON(raw []byte) Object {
	var v Object
	_ = json.Unmarshal(raw, &v)
	return v
}
