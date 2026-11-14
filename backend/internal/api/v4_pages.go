package api

import (
	"encoding/base64"
	"encoding/json"
	"strconv"
	"time"
)

type v4Cursor struct {
	At      time.Time `json:"at"`
	Sort    string    `json:"sort"`
	ID      string    `json:"id"`
	Kind    string    `json:"kind"`
	Purpose string    `json:"purpose"`
	Subject string    `json:"subject"`
	Scope   string    `json:"scope"`
}

func (q *request) v4Page(purpose string, maximum int) (v4Cursor, int, error) {
	c := v4Cursor{Purpose: purpose, Subject: str(q.user["id"]), Scope: digest(encode(Object{"roles": q.user["roles"], "assignments": q.user["assignments"], "revision": q.user["policy_revision"]}))}
	params, e := queryParams(q, "cursor", "limit")
	if e != nil {
		return c, 0, e
	}
	limit := maximum
	if raw, ok := params["limit"]; ok {
		limit, e = strconv.Atoi(raw)
		if e != nil || limit < 1 || limit > maximum {
			return c, 0, fail(422, "VALIDATION_ERROR")
		}
	}
	var now time.Time
	if e = q.tx.QueryRow(q.Context, "SELECT clock_timestamp()").Scan(&now); e != nil {
		return c, 0, e
	}
	if raw, ok := params["cursor"]; ok {
		var previous v4Cursor
		data, err := base64.RawURLEncoding.DecodeString(raw)
		if len(raw) > 1024 || err != nil || json.Unmarshal(data, &previous) != nil || previous.Purpose != purpose || previous.Subject != c.Subject || previous.Scope != c.Scope {
			return c, 0, fail(422, "VALIDATION_ERROR")
		}
		_, err = time.Parse(time.RFC3339Nano, previous.Sort)
		if err != nil || previous.At.After(now) || now.Sub(previous.At) > 24*time.Hour || q.s.Validate("common/Uuid", previous.ID) != nil {
			return c, 0, fail(422, "VALIDATION_ERROR")
		}
		c = previous
	} else {
		c.At = now.UTC()
	}
	return c, limit, nil
}
func (c v4Cursor) next(row Object) string {
	c.Sort = str(row["sort_time"])
	c.ID = str(row["id"])
	c.Kind = str(row["kind"])
	return base64.RawURLEncoding.EncodeToString(encode(c))
}
