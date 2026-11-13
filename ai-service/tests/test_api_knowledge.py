"""Связка api со знаниями: выбор источника/эмбеддера, старт/закрытие, вектор вопроса в поиске."""

import asyncio
import json
import time

import pytest
from ai_test_support import (
    DOC_PUBLIC,
    REQUEST_ID,
    TOKEN,
    FakeEmbedder,
    axis,
    generate_request,
    intern_a_scope,
    make_settings,
    parse_sse,
)
from app.api import create_app, make_embedder, make_knowledge_source
from app.embeddings import OllamaEmbedder
from app.kb_store import DbKnowledge, IndexNotReady, StaticKnowledge
from app.knowledge import chunk_document, load_corpus
from app.retrieval import KnowledgeBase
from fastapi.testclient import TestClient

LIVE = {"llm_mode": "live", "llm_base_url": "http://ollama:11434", "llm_model": "qwen3.5:9b"}
DOCUMENTS = load_corpus()
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "X-Request-ID": REQUEST_ID,
    "Content-Type": "application/json",
}


def vectors_by_document() -> dict:
    vectors = {}
    for index, document in enumerate(DOCUMENTS):
        for chunk in chunk_document(document):
            vectors[(document.id, chunk.position)] = axis(index)
    return vectors


def public_axis() -> list[float]:
    for index, document in enumerate(DOCUMENTS):
        if document.id == DOC_PUBLIC:
            return axis(index)
    raise KeyError(DOC_PUBLIC)


def test_make_embedder_only_in_live():
    assert make_embedder(make_settings()) is None
    assert isinstance(make_embedder(make_settings(**LIVE)), OllamaEmbedder)


def test_make_knowledge_source_by_setting():
    assert isinstance(make_knowledge_source(make_settings(), None), StaticKnowledge)
    db = make_knowledge_source(make_settings(knowledge_source="db"), None)
    assert isinstance(db, DbKnowledge)


class RecordingSource:
    def __init__(self, knowledge, fail_start=False):
        self.knowledge = knowledge
        self.fail_start = fail_start
        self.calls = []

    async def start(self):
        self.calls.append("start")
        if self.fail_start:
            raise IndexNotReady("индекс kb пуст")

    async def current(self):
        self.calls.append("current")
        return self.knowledge

    def close(self):
        self.calls.append("close")


def test_lifespan_starts_source_warms_embedder_and_closes_all():
    source = RecordingSource(KnowledgeBase(DOCUMENTS))
    embedder = FakeEmbedder()
    app = create_app(make_settings(), embedder=embedder, source=source)
    with TestClient(app) as client:
        assert client.get("/healthz").status_code == 200
    assert source.calls == ["start", "close"]
    assert embedder.lifecycle == ["warm_up", "aclose"]


def test_service_does_not_start_without_index():
    source = RecordingSource(KnowledgeBase(DOCUMENTS), fail_start=True)
    with pytest.raises(IndexNotReady):
        with TestClient(create_app(make_settings(), source=source)):
            pass


def search_body(query: str) -> str:
    body = {"query": query, "access_scope": intern_a_scope(), "top_k": 3}
    return json.dumps(body, ensure_ascii=False)


def test_knowledge_search_uses_query_vector_when_index_has_vectors():
    embedder = FakeEmbedder(lambda text: public_axis())
    knowledge = KnowledgeBase(DOCUMENTS, vectors_by_document())
    client = TestClient(create_app(make_settings(), knowledge=knowledge, embedder=embedder))
    response = client.post(
        "/internal/v2/knowledge/search", content=search_body("с чего начать"), headers=HEADERS
    )
    assert response.status_code == 200
    assert [source["document_id"] for source in response.json()["sources"]] == [DOC_PUBLIC]
    assert embedder.calls == [["с чего начать"]]


def test_lexical_index_does_not_call_embedder():
    embedder = FakeEmbedder()
    client = TestClient(
        create_app(make_settings(), knowledge=KnowledgeBase(DOCUMENTS), embedder=embedder)
    )
    response = client.post(
        "/internal/v2/knowledge/search", content=search_body("с чего начать"), headers=HEADERS
    )
    assert response.json() == {"sources": []}
    assert embedder.calls == []


def test_generate_puts_vector_found_fragment_into_sources():
    embedder = FakeEmbedder(lambda text: public_axis())
    knowledge = KnowledgeBase(DOCUMENTS, vectors_by_document())
    client = TestClient(create_app(make_settings(), knowledge=knowledge, embedder=embedder))
    request = generate_request()
    request["access_scope"] = intern_a_scope()  # в примере контракта памятка не разрешена
    request["messages"][-1]["content"] = "с чего начать в первый день"
    response = client.post(
        "/internal/v2/generate",
        content=json.dumps(request, ensure_ascii=False),
        headers=HEADERS,
    )
    events = [item for item in parse_sse(response.text) if "event" in item]
    sources = next(item for item in events if item["event"] == "message.sources")
    assert DOC_PUBLIC in [source["document_id"] for source in sources["data"]["sources"]]
    assert len(sources["data"]["sources"]) <= 3
    assert len(embedder.calls) == 1


# --- /readyz: индекс годен и модели прогреты (ревью TL, AI-R1) ------------------------


class GatedProvider:
    """Провайдер, чей прогрев идёт, пока тест не откроет ворота."""

    def __init__(self):
        self.gate = asyncio.Event()

    async def warm_up(self):
        await self.gate.wait()

    async def aclose(self):
        pass


def wait_ready(client) -> object:
    """Прогрев идёт фоновой задачей: даём ей несколько шансов завершиться."""
    response = client.get("/readyz")
    for _ in range(20):
        if response.status_code == 200:
            break
        time.sleep(0.01)
        response = client.get("/readyz")
    return response


def test_readyz_ok_with_corpus_after_warm_up():
    with TestClient(create_app(make_settings())) as client:
        response = wait_ready(client)
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ai-service"}


def test_readyz_fails_on_empty_corpus_while_healthz_lives():
    source = StaticKnowledge(KnowledgeBase([]))
    with TestClient(create_app(make_settings(), source=source)) as client:
        assert client.get("/healthz").status_code == 200
        response = client.get("/readyz")
    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"
    assert "пуст" in response.json()["reason"]


def test_readyz_waits_for_model_warm_up():
    provider = GatedProvider()
    with TestClient(create_app(make_settings(), provider=provider)) as client:
        response = client.get("/readyz")
        assert response.status_code == 503
        assert "прогрева" in response.json()["reason"]
        client.portal.call(provider.gate.set)
        assert wait_ready(client).status_code == 200


def test_readyz_without_startup_is_not_ready():
    response = TestClient(create_app(make_settings())).get("/readyz")
    assert response.status_code == 503
