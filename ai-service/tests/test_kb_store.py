"""Источники знаний: файлы (+ векторы при старте) и индекс kb (fake-соединение без базы)."""

import asyncio
import json
import logging

import psycopg
import pytest
from ai_test_support import DOC_A, FakeConnection, FakeEmbedder, axis, make_settings
from app.kb_store import (
    DbKnowledge,
    IndexNotReady,
    StaticKnowledge,
    check_ready,
    parse_vector,
    read_index,
)
from app.knowledge import chunk_document, load_corpus
from app.retrieval import KnowledgeBase
from app.vectors import EmbeddingError

DOCUMENTS = load_corpus()
REVISION_SQL = "SELECT dataset_version"
DOCUMENTS_SQL = "SELECT id, title"
CHUNKS_SQL = "SELECT document_id, position"


def run(coroutine):
    return asyncio.run(coroutine)


def document_rows(documents=DOCUMENTS) -> list[tuple]:
    return [
        (
            d.id,
            d.title,
            d.content,
            d.version,
            d.visibility,
            d.team_id,
            d.resource_id,
            d.content_hash,
        )
        for d in documents
    ]


def chunk_rows(with_vectors: bool = True, documents=DOCUMENTS) -> list[tuple]:
    rows = []
    for index, document in enumerate(documents):
        for chunk in chunk_document(document):
            vector = json.dumps(axis(index)) if with_vectors else None
            rows.append((document.id, chunk.position, chunk.text, chunk.document_version, vector))
    return rows


def live_revision(version: str = "kb-1") -> tuple:
    return (version, "2026-11-12T10:00:00", "live", "bge-m3")


def connection_with(revision, chunks=None) -> FakeConnection:
    answers = {
        REVISION_SQL: [revision] if revision else [],
        DOCUMENTS_SQL: document_rows(),
        CHUNKS_SQL: chunk_rows() if chunks is None else chunks,
    }
    return FakeConnection(answers)


# --- файлы ---------------------------------------------------------------


def test_static_without_embedder_keeps_lexical_index():
    knowledge = KnowledgeBase(DOCUMENTS)
    source = StaticKnowledge(knowledge)
    run(source.start())
    assert run(source.current()) is knowledge
    source.close()


def test_static_with_embedder_adds_vectors_at_start():
    fake = FakeEmbedder()
    source = StaticKnowledge(KnowledgeBase(DOCUMENTS), fake)
    run(source.start())
    knowledge = run(source.current())
    assert len(knowledge.vectors) == len(knowledge.chunks)


def test_static_keeps_existing_vectors():
    fake = FakeEmbedder()
    knowledge = KnowledgeBase(DOCUMENTS, {(DOC_A, 0): axis(0)})
    run(StaticKnowledge(knowledge, fake).start())
    assert fake.calls == []


def test_static_embedder_failure_stays_lexical(caplog):
    source = StaticKnowledge(KnowledgeBase(DOCUMENTS), FakeEmbedder(error=EmbeddingError("x")))
    with caplog.at_level(logging.WARNING, logger="app.kb_store"):
        run(source.start())
    assert run(source.current()).vectors == {}
    assert "только лексическим" in caplog.text


# --- чтение kb -----------------------------------------------------------


def test_parse_vector():
    assert parse_vector("[0.5,-1,2e-3]") == [0.5, -1, 0.002]
    assert parse_vector(None) is None


def test_read_index_restores_documents_acl_and_vectors():
    knowledge = read_index(connection_with(live_revision()))
    assert set(knowledge.documents) == {document.id for document in DOCUMENTS}
    restored = knowledge.documents[DOC_A]
    original = next(document for document in DOCUMENTS if document.id == DOC_A)
    assert restored == original  # включая visibility/team_id/resource_id
    assert len(knowledge.vectors) == len(knowledge.chunks)


def test_read_index_without_vectors_is_lexical():
    knowledge = read_index(connection_with(live_revision(), chunk_rows(with_vectors=False)))
    assert knowledge.vectors == {}


@pytest.mark.parametrize("damage", ["missing", "other-text", "other-version"])
def test_read_index_rejects_chunks_from_another_corpus(damage):
    rows = chunk_rows()
    first = rows[0]
    if damage == "missing":
        rows = rows[1:]
    elif damage == "other-text":
        rows[0] = (first[0], first[1], "старый текст", first[3], first[4])
    else:
        rows[0] = (first[0], first[1], first[2], first[3] + 1, first[4])
    with pytest.raises(IndexNotReady):
        read_index(connection_with(live_revision(), rows))


LIVE = {"llm_mode": "live", "llm_base_url": "http://ollama:11434", "llm_model": "qwen3.5:9b"}


@pytest.mark.parametrize(
    "revision, settings",
    [
        (None, {}),
        (("kb-1", "t", "mock", None), LIVE),  # live-сервис на индексе без векторов
        (("kb-1", "t", "live", "other-model"), LIVE),  # векторы другой модели
        (("kb-1", "t", "live", "other-model"), {}),  # и в mock не смешиваем
    ],
)
def test_check_ready_rejects_unsuitable_index(revision, settings):
    with pytest.raises(IndexNotReady):
        check_ready(revision, make_settings(**settings))


@pytest.mark.parametrize(
    "revision, settings",
    [
        (("kb-1", "t", "mock", None), {}),
        (("kb-1", "t", "live", "bge-m3"), LIVE),
        (("kb-1", "t", "live", "bge-m3"), {}),  # mock-сервис просто не использует векторы
    ],
)
def test_check_ready_accepts_suitable_index(revision, settings):
    check_ready(revision, make_settings(**settings))


# --- DbKnowledge ---------------------------------------------------------


class Database:
    """Фабрика соединений: можно подменить ревизию и «уронить» базу."""

    def __init__(self, revision):
        self.revision = revision
        self.down = False
        self.connections = []

    def connect(self, **kwargs):
        if self.down:
            raise psycopg.OperationalError("connection refused")
        error = None
        connection = connection_with(self.revision)
        connection.answers[REVISION_SQL] = lambda: [self.revision]
        connection.error = error
        self.connections.append(connection)
        return connection

    def index_reads(self) -> int:
        return sum(
            1
            for connection in self.connections
            for query, _ in connection.statements
            if query.startswith(DOCUMENTS_SQL)
        )


def test_db_source_loads_on_start_and_reloads_only_on_new_revision():
    database = Database(live_revision("kb-1"))
    source = DbKnowledge(make_settings(**LIVE), database.connect)
    run(source.start())
    first = run(source.current())
    assert run(source.current()) is first
    assert database.index_reads() == 1
    database.revision = live_revision("kb-2")
    second = run(source.current())
    assert second is not first
    assert database.index_reads() == 2
    source.close()
    assert database.connections[0].closed


def test_db_source_start_fails_without_index():
    source = DbKnowledge(make_settings(), Database(None).connect)
    with pytest.raises(IndexNotReady):
        run(source.start())


def test_db_source_start_fails_when_database_down():
    database = Database(live_revision())
    database.down = True
    with pytest.raises(IndexNotReady):
        run(DbKnowledge(make_settings(), database.connect).start())


def test_db_source_keeps_last_index_when_database_breaks(caplog):
    database = Database(live_revision())
    source = DbKnowledge(make_settings(**LIVE), database.connect)
    run(source.start())
    loaded = run(source.current())
    database.connections[0].error = psycopg.OperationalError("gone")
    with caplog.at_level(logging.WARNING, logger="app.kb_store"):
        assert run(source.current()) is loaded
    assert "используем загруженный" in caplog.text
    # Сломанное соединение закрыто, следующий запрос открывает новое.
    assert database.connections[0].closed
    run(source.current())
    assert len(database.connections) == 2


def test_db_source_close_without_connection():
    DbKnowledge(make_settings(), Database(None).connect).close()
