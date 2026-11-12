"""CLI ingest без настоящей базы: fake-соединение записывает SQL, fake-эмбеддер даёт векторы."""

import psycopg
import pytest
from ai_test_support import FakeConnection, FakeEmbedder, axis
from app import ingest
from app.knowledge import CORPUS_DIR, chunk_document, load_corpus
from app.vectors import EmbeddingError

DOCUMENTS = load_corpus()
CHUNKS = sum(len(chunk_document(document)) for document in DOCUMENTS)
MOCK_ENV = {"LLM_MODE": "mock"}
LIVE_ENV = {"LLM_MODE": "live", "LLM_BASE_URL": "http://ollama:11434", "LLM_MODEL": "qwen3.5:9b"}


class Database:
    def __init__(self, version: str | None = None, error: Exception | None = None):
        self.connection = FakeConnection(
            {"SELECT dataset_version FROM kb.index_metadata": [(version,)] if version else []},
            error,
        )
        self.kwargs = None

    def connect(self, **kwargs):
        self.kwargs = kwargs
        return self.connection

    def inserts(self, table: str) -> list:
        return [
            params for query, params in self.connection.statements if f"INTO kb.{table}" in query
        ]


def run_ingest(database, env=MOCK_ENV, embedder=None, corpus=CORPUS_DIR) -> int:
    embedder = embedder or FakeEmbedder()
    return ingest.run(env, corpus, database.connect, lambda settings: embedder)


def test_mock_ingest_writes_documents_chunks_and_metadata(capsys):
    database = Database()
    assert run_ingest(database) == ingest.EXIT_OK
    assert database.kwargs == {"autocommit": True, "connect_timeout": 5}
    assert database.connection.transactions == 1
    statements = [query for query, _ in database.connection.statements]
    # Сначала всё старое удаляется (в том числе legacy-документы seed), потом вставка.
    assert statements[1:4] == [
        "DELETE FROM kb.index_metadata",
        "DELETE FROM kb.chunks",
        "DELETE FROM kb.documents",
    ]
    documents = database.inserts("documents")
    assert {row[0] for row in documents} == {document.id for document in DOCUMENTS}
    restricted = next(row for row in documents if row[5] == "restricted")
    assert restricted[6] and restricted[7]  # team_id и resource_id сохранены
    chunks = database.inserts("chunks")
    assert len(chunks) == CHUNKS
    assert all(row[4] is None and row[5] is None for row in chunks)  # без векторов
    (metadata,) = database.inserts("index_metadata")
    assert metadata[:3] == ("mock", None, None)
    assert "mock, без векторов" in capsys.readouterr().out


def test_live_ingest_stores_vectors_of_configured_model(capsys):
    database = Database()
    fake = FakeEmbedder(lambda text: axis(2, 1024))
    assert run_ingest(database, LIVE_ENV, fake) == ingest.EXIT_OK
    chunks = database.inserts("chunks")
    assert all(row[5] == "ollama:bge-m3:1024:p1" for row in chunks)
    assert chunks[0][4] == ingest.vector_literal(axis(2, 1024))
    (metadata,) = database.inserts("index_metadata")
    assert metadata[:3] == ("live", "ollama:bge-m3:1024:p1", 1024)
    assert "aclose" in fake.lifecycle
    assert "live, ollama:bge-m3:1024:p1, 1024" in capsys.readouterr().out


def test_repeated_ingest_without_changes_writes_nothing(capsys):
    version = ingest.dataset_version(DOCUMENTS, "mock", None)
    database = Database(version)
    assert run_ingest(database) == ingest.EXIT_OK
    assert database.connection.transactions == 0
    assert "уже актуален" in capsys.readouterr().out


def test_live_ingest_with_embeddings_down_writes_nothing(capsys):
    database = Database()
    fake = FakeEmbedder(error=EmbeddingError("Ollama недоступна"))
    assert run_ingest(database, LIVE_ENV, fake) == ingest.EXIT_EMBEDDINGS
    assert database.connection.transactions == 0
    assert "Эмбеддинги недоступны" in capsys.readouterr().err


def test_database_error_exit_code_hides_details(capsys):
    error = psycopg.OperationalError("password authentication failed for user ai_service")
    assert run_ingest(Database(error=error)) == ingest.EXIT_DATABASE
    err = capsys.readouterr().err
    assert "OperationalError" in err
    assert "ai_service" not in err


def test_bad_corpus_and_bad_settings_exit_1(tmp_path, capsys):
    (tmp_path / "bad.md").write_text("без метаданных", encoding="utf-8")
    assert run_ingest(Database(), corpus=tmp_path) == ingest.EXIT_INPUT
    assert run_ingest(Database(), env={"LLM_MODE": "live"}) == ingest.EXIT_INPUT
    assert capsys.readouterr().err.count("Ошибка входных данных") == 2


def test_dataset_version_tracks_content_mode_and_model():
    base = ingest.dataset_version(DOCUMENTS, "mock", None)
    assert base == ingest.dataset_version(DOCUMENTS, "mock", None)
    assert base.startswith("kb-")
    assert base != ingest.dataset_version(DOCUMENTS, "live", "bge-m3")
    assert base != ingest.dataset_version(DOCUMENTS[1:], "mock", None)


def test_chunk_ids_are_stable():
    document = DOCUMENTS[0]
    assert ingest.chunk_id(document, 0) == ingest.chunk_id(document, 0)
    assert ingest.chunk_id(document, 0) != ingest.chunk_id(document, 1)


@pytest.mark.parametrize("vector, literal", [([1, 0.5], "[1.0,0.5]"), ([-2e-05], "[-2e-05]")])
def test_vector_literal(vector, literal):
    assert ingest.vector_literal(vector) == literal


def test_live_ingest_uses_ollama_embedder():
    from app.config import load_settings
    from app.embeddings import OllamaEmbedder

    settings = load_settings({**LIVE_ENV, "INTERNAL_API_TOKEN": "t"})
    assert isinstance(ingest.make_embedder(settings), OllamaEmbedder)
