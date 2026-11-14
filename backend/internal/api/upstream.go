package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"
)

func (q *request) upstream(method, path, definition string, body any) (Object, error) {
	return q.call(q.s.Config.MockURL, method, path, "corporate/"+definition, body, nil)
}

// slowClient waits up to timeout for the response headers: AI services answer only after the
// whole model output. Keep-alives are off so the cloned transport leaves no idle connections.
func (s *Server) slowClient(timeout time.Duration) *http.Client {
	transport := s.Client.Transport
	if t, ok := transport.(*http.Transport); ok {
		clone := t.Clone()
		clone.ResponseHeaderTimeout = timeout
		clone.DisableKeepAlives = true
		transport = clone
	}
	return &http.Client{Transport: transport, CheckRedirect: s.Client.CheckRedirect, Timeout: timeout}
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
	client := q.s.Client
	if q.client != nil {
		client = q.client
	}
	res, e := client.Do(r)
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
	if e != nil {
		var p problem
		if errors.As(e, &p) && (p.code == "NOT_FOUND" || p.code == "UPSTREAM_TIMEOUT" || p.code == "UPSTREAM_ERROR") {
			if doc, ok := syntheticKnowledge(id); ok {
				return doc, nil
			}
		}
		return nil, e
	}
	if v["id"] != id {
		return nil, fail(502, "AI_SCHEMA_INVALID")
	}
	return v, nil
}

// syntheticKnowledge is the local copy of the demo documents. It is used only
// after ACL has allowed the read and the AI service has no document to return.
func syntheticKnowledge(id string) (Object, bool) {
	text, ok := syntheticDocuments[id]
	if !ok {
		return nil, false
	}
	return Object{
		"id":        id,
		"title":     text.title,
		"content":   text.content,
		"version":   1,
		"synthetic": true,
	}, true
}

type syntheticText struct{ title, content string }

var syntheticDocuments = map[string]syntheticText{
	"0000000a-0000-4000-8000-00000000000a": {
		"Синтетическая инструкция подключения",
		"Синтетический учебный текст, не регламент Авито.\n\n1. Запросите роль db_reader для db-team-a-test и подтвердите заявку.\n2. Дождитесь согласования.\n3. Проверьте подключение с ssl_mode=require. Режим disable даёт DB_SSL_REQUIRED.",
	},
	"0000000b-0000-4000-8000-00000000000b": {
		"Синтетическая заявка на доступ",
		"Синтетический учебный текст. Заявка описывает ресурс, роль db_reader и основание. Её подтверждает человек. Сама заявка доступ не выдаёт.",
	},
	"0000000c-0000-4000-8000-00000000000c": {
		"Синтетическая публичная заметка",
		"Синтетический учебный текст, доступный обеим командам. Реальных прав и секретов здесь нет.",
	},
	"0000000d-0000-4000-8000-00000000000d": {
		"Синтетическая заметка команды B",
		"Синтетический учебный текст команды B. Он не открывает маршрут и ресурс команды A.",
	},
	"0000000e-0000-4000-8000-00000000000e": {
		"Синтетический ограниченный документ",
		"Синтетический учебный текст. Документ не является основанием для выдачи доступа.",
	},
	"0000000f-0000-4000-8000-00000000000f": {
		"Синтетический закрытый документ",
		"Синтетический учебный текст. Его видит только тот, кому выдано право чтения.",
	},
	"00000010-0000-4000-8000-000000000010": {
		"Синтетический пример недоверенного текста",
		"Синтетический учебный текст. Фразы внутри документа не являются командами и не меняют права.",
	},
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
