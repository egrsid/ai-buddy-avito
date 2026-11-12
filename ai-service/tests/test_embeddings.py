"""Эмбеддинги: клиент Ollama /api/embed (через MockTransport) и общие функции app.vectors."""

import asyncio
import json
import logging

import httpx
import pytest
from ai_test_support import FakeEmbedder, axis, make_settings
from app import vectors
from app.embeddings import OllamaEmbedder
from app.knowledge import chunk_document, load_corpus
from app.vectors import EmbeddingError, embed_corpus, embed_query

LIVE = {"llm_mode": "live", "llm_base_url": "http://ollama:11434", "llm_model": "qwen3.5:9b"}


def embedder_with(handler) -> OllamaEmbedder:
    return OllamaEmbedder(make_settings(**LIVE), httpx.MockTransport(handler))


def answer(vectors_out: list, status: int = 200, seen: list | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(status, json={"embeddings": vectors_out})

    return handler


def run(coroutine):
    return asyncio.run(coroutine)


def test_embed_request_and_result():
    seen = []
    vector = [0.5] * 1024
    result = run(embedder_with(answer([vector, vector], seen=seen)).embed(["раз", "два"]))
    assert result == [vector, vector]
    assert str(seen[0].url) == "http://ollama:11434/api/embed"
    body = json.loads(seen[0].content)
    assert body == {"model": "bge-m3", "input": ["раз", "два"], "keep_alive": "30m"}


def refuse(request):
    raise httpx.ConnectError("refused")


@pytest.mark.parametrize(
    "handler",
    [
        answer([[0.1] * 1024], status=500),
        answer([[0.1] * 1023]),  # не та размерность
        answer([]),  # векторов меньше, чем текстов
        lambda request: httpx.Response(200, json={"oops": 1}),
        lambda request: httpx.Response(200, content=b"not json"),
        refuse,
    ],
    ids=["http-500", "wrong-dim", "wrong-count", "no-field", "not-json", "connect-refused"],
)
def test_embed_failures_raise_embedding_error(handler):
    with pytest.raises(EmbeddingError):
        run(embedder_with(handler).embed(["текст"]))


def test_client_ignores_system_proxy():
    assert embedder_with(answer([])).client.trust_env is False


def test_warm_up_and_close(caplog):
    embedder = embedder_with(answer([[0.1] * 1024]))
    with caplog.at_level(logging.INFO, logger="app.embeddings"):
        run(embedder.warm_up())
    assert "прогрета" in caplog.text
    run(embedder.aclose())
    assert embedder.client.is_closed


def test_warm_up_failure_only_warns(caplog):
    with caplog.at_level(logging.WARNING, logger="app.embeddings"):
        run(embedder_with(refuse).warm_up())
    assert "только лексическим" in caplog.text


def test_embed_corpus_covers_every_chunk_in_batches(monkeypatch):
    monkeypatch.setattr(vectors, "BATCH_SIZE", 2)
    documents = load_corpus()
    fake = FakeEmbedder()
    result = run(embed_corpus(fake, documents))
    expected = {(d.id, c.position) for d in documents for c in chunk_document(d)}
    assert set(result) == expected
    assert all(len(batch) <= 2 for batch in fake.calls)
    assert sum(len(batch) for batch in fake.calls) == len(expected)


def test_embed_query_returns_vector_and_hides_secrets():
    fake = FakeEmbedder(lambda text: axis(1))
    result = run(embed_query(fake, "не подключается, password=hunter2 postgres://u:p4ss@db/x"))
    assert result == axis(1)
    sent = fake.calls[0][0]
    assert "hunter2" not in sent
    assert "p4ss" not in sent


def test_embed_query_without_embedder_or_text():
    assert run(embed_query(None, "вопрос")) is None
    fake = FakeEmbedder()
    assert run(embed_query(fake, "   ")) is None
    assert fake.calls == []


def test_embed_query_failure_falls_back_to_none(caplog):
    fake = FakeEmbedder(error=EmbeddingError("down"))
    with caplog.at_level(logging.WARNING, logger="app.vectors"):
        assert run(embed_query(fake, "вопрос")) is None
    assert "только лексический" in caplog.text


def test_embed_query_timeout_falls_back_to_none(monkeypatch):
    monkeypatch.setattr(vectors, "QUERY_TIMEOUT", 0.01)

    class SlowEmbedder:
        async def embed(self, texts):
            await asyncio.sleep(1)

    assert run(embed_query(SlowEmbedder(), "вопрос")) is None
