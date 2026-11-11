"""Общие помощники тестов AI-сервиса: пример запроса из контракта и разбор SSE."""

import asyncio
import copy
import json
from functools import cache
from pathlib import Path

from app.config import Settings
from app.knowledge import load_corpus
from app.retrieval import KnowledgeBase

ROOT = Path(__file__).resolve().parents[2]
TOKEN = "test-token"
REQUEST_ID = "00000099-0000-4000-8000-000000000099"
# Короткие таймеры, чтобы тесты не ждали по 20 секунд.
FAST = {
    "first_token_timeout": 0.2,
    "stream_idle_timeout": 0.2,
    "pipeline_timeout": 1.0,
    "ping_interval": 0.05,
    "slow_stream_delay": 0.01,
}


def make_settings(**overrides) -> Settings:
    values = {"internal_api_token": TOKEN, "app_env": "test", **FAST}
    values.update(overrides)
    return Settings(**values)


def generate_request() -> dict:
    """Валидный GenerateRequest из contracts/v2/examples/ai.json (копия)."""
    path = ROOT / "contracts" / "v2" / "examples" / "ai.json"
    records = json.loads(path.read_text(encoding="utf-8"))
    for record in records:
        if record["definition"] == "GenerateRequest":
            return copy.deepcopy(record["payload"])
    raise AssertionError("в examples/ai.json нет GenerateRequest")


def parse_sse(text: str) -> list[dict]:
    """Разбирает поток на элементы: {"ping": True} или {"event", "id", "data"}."""
    items = []
    for block in text.split("\n\n"):
        if not block:
            continue
        if block == ": ping":
            items.append({"ping": True})
            continue
        item = {}
        for line in block.split("\n"):
            key, value = line.split(": ", 1)
            item[key] = value
        items.append(
            {"event": item["event"], "id": int(item["id"]), "data": json.loads(item["data"])}
        )
    return items


def collect(stream) -> list[dict]:
    """Прогоняет async-генератор run_generate до конца и разбирает результат."""

    async def read_all() -> str:
        parts = []
        async for part in stream:
            parts.append(part)
        return "".join(parts)

    return parse_sse(asyncio.run(read_all()))


def events(items: list[dict]) -> list[dict]:
    return [item for item in items if "event" in item]


DOC_A = "0000000a-0000-4000-8000-00000000000a"  # инструкция подключения team-a (с дефектом SSL)
DOC_A_REQUEST = "0000000b-0000-4000-8000-00000000000b"  # заявка db_reader, team-a
DOC_PUBLIC = "0000000c-0000-4000-8000-00000000000c"  # общая памятка
DOC_B = "0000000d-0000-4000-8000-00000000000d"  # team-b, кодовое слово ORCHID-B
DOC_RESTRICTED = "0000000e-0000-4000-8000-00000000000e"  # restricted, CRIMSON-R
DOC_PRIVATE = "0000000f-0000-4000-8000-00000000000f"  # synthetic PII, PEARL-P
DOC_NOTES = "00000010-0000-4000-8000-000000000010"  # public, содержит prompt injection
ALL_DOCS = (DOC_A, DOC_A_REQUEST, DOC_PUBLIC, DOC_B, DOC_RESTRICTED, DOC_PRIVATE, DOC_NOTES)
SECRET_MARKERS = ("ORCHID-B", "CRIMSON-R", "PEARL-P", "+7 900", "example.invalid")


@cache
def knowledge() -> KnowledgeBase:
    return KnowledgeBase(load_corpus())


def scope(team: str, documents, resources: dict | None = None) -> dict:
    """AccessScope: команда, явные knowledge.read на документы, права на ресурсы."""
    resources = resources or {}
    return {
        "subject_id": "00000001-0000-4000-8000-000000000001",
        "team_ids": [team],
        "resource_permissions": [
            {"resource_id": resource, "permissions": permissions}
            for resource, permissions in resources.items()
        ],
        "document_permissions": [
            {"document_id": document, "permissions": ["knowledge.read"]} for document in documents
        ],
        "policy_revision": "policy-test",
    }


def intern_a_scope() -> dict:
    resources = {"db-team-a-test": ["resource.view", "access.request", "db.check"]}
    return scope("team-a", (DOC_A, DOC_A_REQUEST, DOC_PUBLIC, DOC_NOTES), resources)


def intern_c_scope() -> dict:
    resources = {"db-team-b-test": ["resource.view", "access.request", "db.check"]}
    return scope("team-b", (DOC_B, DOC_PUBLIC, DOC_NOTES), resources)


def greedy_scope() -> dict:
    """Go по ошибке выдал knowledge.read на всё; собственная ACL документов всё равно режет."""
    resources = {"db-team-a-test": ["resource.view", "access.request"]}
    return scope("team-a", ALL_DOCS, resources)
