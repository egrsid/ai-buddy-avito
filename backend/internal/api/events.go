package api

func (q *request) event(id, kind, source, entity, entityID, correlation string, payload Object) error {
	value := Object{"id": id, "type": kind, "schema_version": 1, "occurred_at": stamp(q.s.Now()), "source": source, "entity": Object{"type": entity, "id": entityID}, "correlation_id": correlation, "payload": payload, "synthetic": true}
	if q.s.Validate("events/BusinessEvent", value) != nil {
		return fail(502, "UPSTREAM_ERROR")
	}
	return q.exec("INSERT INTO app.business_events VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8::jsonb,true) ON CONFLICT (source,id) DO NOTHING", id, kind, value["occurred_at"], source, entity, entityID, correlation, string(encode(payload)))
}

// taskEvent records a v3 workflow fact. Payload is a closed set of IDs/enums without people.
func (q *request) taskEvent(kind, source, entity, entityID string, payload Object) error {
	id := uuid()
	value := Object{"id": id, "type": kind, "schema_version": 1, "occurred_at": stamp(q.s.Now()), "source": source, "entity": Object{"type": entity, "id": entityID}, "correlation_id": q.requestID, "payload": payload, "synthetic": true}
	if q.s.Validate("v3/events/TaskEvent", value) != nil {
		return fail(502, "UPSTREAM_ERROR")
	}
	return q.exec("INSERT INTO app.business_events VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8::jsonb,true)", id, kind, value["occurred_at"], source, entity, entityID, q.requestID, string(encode(payload)))
}
