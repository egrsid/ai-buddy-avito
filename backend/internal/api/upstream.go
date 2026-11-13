package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
)

func (q *request) upstream(method, path, definition string, body any) (Object, error) {
	return q.call(q.s.Config.MockURL, method, path, "corporate/"+definition, body, nil)
}
func (q *request) call(base, method, path, definition string, body any, headers map[string]string) (Object, error) {
	var input io.Reader
	if body != nil {
		input = bytes.NewReader(encode(body))
	}
	r, e := http.NewRequestWithContext(q.Context, method, base+path, input)
	if e != nil {
		return nil, e
	}
	r.Header.Set("Authorization", "Bearer "+q.s.Config.Token)
	r.Header.Set("X-Request-ID", q.requestID)
	r.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	if v := obj(body); v != nil && v["operation_key"] != nil {
		r.Header.Set("Idempotency-Key", str(v["operation_key"]))
	}
	res, e := q.s.Client.Do(r)
	if e != nil {
		return nil, fail(502, "UPSTREAM_TIMEOUT")
	}
	defer res.Body.Close()
	raw, e := io.ReadAll(io.LimitReader(res.Body, 65537))
	if e != nil || len(raw) > 65536 {
		return nil, fail(502, "UPSTREAM_ERROR")
	}
	if res.StatusCode == 404 {
		return nil, fail(404, "NOT_FOUND")
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return nil, fail(502, "UPSTREAM_ERROR")
	}
	var v Object
	if json.Unmarshal(raw, &v) != nil || res.Header.Get("X-Request-ID") != q.requestID || q.s.Validate(definition, v) != nil {
		return nil, fail(502, "AI_SCHEMA_INVALID")
	}
	return v, nil
}
func (q *request) knowledge(id string, u Object) (Object, error) {
	yes, e := q.canRead(id, u)
	if e != nil || !yes {
		return nil, fail(404, "NOT_FOUND")
	}
	scope, e := q.scope(u)
	if e != nil {
		return nil, e
	}
	h := base64.RawURLEncoding.EncodeToString(encode(scope))
	if len(h) > 8192 {
		return nil, fail(403, "FORBIDDEN")
	}
	v, e := q.call(q.s.Config.AIURL, "GET", "/internal/v2/knowledge/"+id, "ai/KnowledgeDocumentResponse", nil, map[string]string{"X-Access-Scope": h})
	if e == nil && v["id"] != id {
		return nil, fail(502, "AI_SCHEMA_INVALID")
	}
	return v, e
}
func getKnowledge(q *request) (response, error) {
	v, e := q.knowledge(q.r.PathValue("id"), q.user)
	return out("KnowledgeDocument", v), e
}
func (q *request) sources(refs any, u Object) ([]any, error) {
	result := []any{}
	for _, r := range list(refs) {
		ref := obj(r)
		id := str(ref["document_id"])
		doc, e := q.knowledge(id, u)
		if e != nil {
			return nil, e
		}
		if num(doc["version"]) != num(ref["version"]) {
			return nil, fail(502, "AI_SCHEMA_INVALID")
		}
		source := Object{"document_id": id, "version": doc["version"], "title": doc["title"], "url": "/api/v2/knowledge/" + id, "excerpt": ref["excerpt"]}
		if source["excerpt"] == nil {
			content := []rune(str(doc["content"]))
			if len(content) > 500 {
				content = content[:500]
			}
			source["excerpt"] = string(content)
		}
		if q.s.Validate("common/Source", source) != nil {
			return nil, fail(502, "AI_SCHEMA_INVALID")
		}
		result = append(result, source)
	}
	return result, nil
}
