"""Интеграция с настоящей kb (PostgreSQL + pgvector) под ролью ai_service.

Запускаются только при KB_INTEGRATION=1 и PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
(после migrate). ВНИМАНИЕ: заменяют содержимое kb — только dev/CI-база. В конце
оставляют mock-индекс текущего корпуса. Модель не нужна: векторы даёт fake-эмбеддер.
"""

import asyncio
import os

import psycopg
import pytest
from ai_test_support import (
    DOC_A,
    DOC_B,
    DOC_PUBLIC,
    DOC_RESTRICTED,
    FakeEmbedder,
    axis,
    intern_a_scope,
    make_settings,
)
from app import ingest
from app.kb_store import DbKnowledge, IndexNotReady
from app.knowledge import CORPUS_DIR, chunk_document, load_corpus

pytestmark = pytest.mark.skipif(
    os.environ.get("KB_INTEGRATION") != "1", reason="нужна kb: KB_INTEGRATION=1 и PG*"
)

DOCUMENTS = load_corpus()
ORDER = [document.id for document in DOCUMENTS]
MOCK_ENV = {"LLM_MODE": "mock"}
LIVE_ENV = {"LLM_MODE": "live", "LLM_BASE_URL": "http://ollama:11434", "LLM_MODEL": "qwen3.5:9b"}
LIVE = {"llm_mode": "live", "llm_base_url": "http://ollama:11434", "llm_model": "qwen3.5:9b"}


def document_axis(text: str) -> list[float]:
    """Вектор фрагмента — ось его документа (по заголовку в начале текста)."""
    for index, document in enumerate(DOCUMENTS):
        if text.startswith(document.title):
            return axis(index, 1024)
    return axis(1023, 1024)


def ingest_with(env: dict) -> int:
    return ingest.run(
        env, CORPUS_DIR, psycopg.connect, lambda settings: FakeEmbedder(document_axis)
    )


def count(query: str) -> int:
    with psycopg.connect(autocommit=True) as connection:
        return connection.execute(query).fetchone()[0]


@pytest.fixture(autouse=True)
def leave_mock_index():
    yield
    assert ingest_with(MOCK_ENV) == ingest.EXIT_OK


def test_mock_ingest_round_trip_with_acl():
    assert ingest_with(MOCK_ENV) == ingest.EXIT_OK
    total = sum(len(chunk_document(document)) for document in DOCUMENTS)
    assert count("SELECT count(*) FROM kb.documents") == len(DOCUMENTS)
    assert count("SELECT count(*) FROM kb.chunks WHERE embedding IS NULL") == total
    source = DbKnowledge(make_settings())
    asyncio.run(source.start())
    knowledge = asyncio.run(source.current())
    assert knowledge.vectors == {}
    hits = knowledge.search(intern_a_scope(), "подключение к базе ssl")
    ids = [hit.document.id for hit in hits]
    assert DOC_A in ids
    assert DOC_B not in ids and DOC_RESTRICTED not in ids
    source.close()


def test_repeated_ingest_is_noop(capsys):
    assert ingest_with(MOCK_ENV) == ingest.EXIT_OK
    capsys.readouterr()
    assert ingest_with(MOCK_ENV) == ingest.EXIT_OK
    assert "уже актуален" in capsys.readouterr().out


def test_live_ingest_stores_1024_vectors_and_hybrid_search_uses_them():
    assert ingest_with(LIVE_ENV) == ingest.EXIT_OK
    assert count("SELECT count(*) FROM kb.chunks WHERE embedding IS NULL") == 0
    assert count("SELECT min(vector_dims(embedding)) FROM kb.chunks") == 1024
    source = DbKnowledge(make_settings(**LIVE))
    asyncio.run(source.start())
    knowledge = asyncio.run(source.current())
    assert len(knowledge.vectors) == len(knowledge.chunks)
    vector = axis(ORDER.index(DOC_PUBLIC), 1024)
    hits = knowledge.search(intern_a_scope(), "с чего начать", query_vector=vector)
    assert [hit.document.id for hit in hits] == [DOC_PUBLIC]
    source.close()


def test_live_service_refuses_mock_index():
    assert ingest_with(MOCK_ENV) == ingest.EXIT_OK
    with pytest.raises(IndexNotReady):
        asyncio.run(DbKnowledge(make_settings(**LIVE)).start())


def test_database_rejects_vectors_of_wrong_dimension():
    assert ingest_with(MOCK_ENV) == ingest.EXIT_OK
    with psycopg.connect() as connection:
        with pytest.raises(psycopg.errors.DataException):
            connection.execute("UPDATE kb.chunks SET embedding = '[1,2,3]', embedding_model = 'x'")
