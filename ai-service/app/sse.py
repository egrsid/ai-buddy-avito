"""Форматирование Server-Sent Events (api-contracts.md, раздел «AI SSE»).

Событие: строки event/id/data и пустая строка. data — однострочный JSON.
Ping — SSE-комментарий без id: держит соединение, но не считается текстом.
"""

import json

PING = ": ping\n\n"


def format_event(event_type: str, sequence: int, payload: dict) -> str:
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event_type}\nid: {sequence}\ndata: {data}\n\n"
