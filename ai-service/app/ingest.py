"""Ingest корпуса в kb: python -m app.ingest [папка корпуса].

Читает data/knowledge/v2, режет на фрагменты и одной транзакцией заменяет документы,
фрагменты и index_metadata. Режим — из LLM_MODE:
- mock: фрагменты и права без векторов (поиск лексический), без сети и модели;
- live: ещё и векторы bge-m3 через Ollama (LLM_BASE_URL, EMBEDDING_MODEL).
Работает под ролью ai_service (PGHOST/PGUSER/PGPASSWORD/PGDATABASE), без DDL.
Повторный запуск без изменений ничего не пишет. Документы, которых нет в корпусе,
удаляются (в том числе legacy-записи seed): индекс — ровно текущий корпус.

Коды выхода: 0 — готово или уже актуально; 1 — корпус или настройки;
2 — эмбеддинги недоступны; 3 — ошибка базы.
"""

import asyncio
import hashlib
import json
import os
import sys
import uuid
from pathlib import Path

import psycopg

from app.config import EMBEDDING_DIM, ConfigError, Settings, load_settings
from app.knowledge import (
    CHUNK_MAX,
    CHUNK_OVERLAP,
    CORPUS_DIR,
    CorpusError,
    Document,
    chunk_document,
    load_corpus,
)
from app.vectors import EmbeddingError, embed_corpus, embedding_profile

EXIT_OK = 0
EXIT_INPUT = 1
EXIT_EMBEDDINGS = 2
EXIT_DATABASE = 3
CONNECT_TIMEOUT = 5
# Пространство имён для стабильных ID фрагментов: тот же фрагмент — тот же UUID.
CHUNK_NAMESPACE = uuid.UUID("6f1c2a8e-5b1d-4c3e-9a7f-0d2b4e6a8c10")


def dataset_version(documents: list[Document], mode: str, model: str | None) -> str:
    """Отпечаток индекса: меняется при любой правке документов, прав, нарезки или модели."""
    parts = {
        "mode": mode,
        "model": model,
        "chunking": [CHUNK_MAX, CHUNK_OVERLAP],
        "documents": [
            [doc.id, doc.version, doc.content_hash, doc.visibility, doc.team_id, doc.resource_id]
            for doc in documents
        ],
    }
    raw = json.dumps(parts, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return "kb-" + hashlib.sha256(raw).hexdigest()[:16]


def vector_literal(vector: list[float]) -> str:
    """Текстовый формат pgvector "[0.1,0.2,...]": так не нужен отдельный пакет pgvector."""
    return "[" + ",".join(repr(float(value)) for value in vector) + "]"


def chunk_id(document: Document, position: int) -> str:
    return str(uuid.uuid5(CHUNK_NAMESPACE, f"{document.id}:{document.version}:{position}"))


def current_version(connection) -> str | None:
    row = connection.execute("SELECT dataset_version FROM kb.index_metadata").fetchone()
    return None if row is None else row[0]


def write_index(
    connection,
    documents: list[Document],
    vectors: dict[tuple[str, int], list[float]],
    model: str | None,
    version: str,
) -> int:
    """Полная замена индекса одной транзакцией: читатели видят старый или новый, не смесь."""
    mode = "live" if model else "mock"
    count = 0
    with connection.transaction():
        connection.execute("DELETE FROM kb.index_metadata")
        connection.execute("DELETE FROM kb.chunks")
        connection.execute("DELETE FROM kb.documents")
        for document in documents:
            connection.execute(
                "INSERT INTO kb.documents (id, title, content, version, content_hash, visibility, "
                "synthetic, team_id, resource_id) VALUES (%s, %s, %s, %s, %s, %s, true, %s, %s)",
                (
                    document.id,
                    document.title,
                    document.content,
                    document.version,
                    document.content_hash,
                    document.visibility,
                    document.team_id,
                    document.resource_id,
                ),
            )
            for chunk in chunk_document(document):
                vector = vectors.get((document.id, chunk.position))
                literal = None if vector is None else vector_literal(vector)
                connection.execute(
                    "INSERT INTO kb.chunks (id, document_id, position, content, embedding, "
                    "embedding_model, document_version) "
                    "VALUES (%s, %s, %s, %s, %s::vector, %s, %s)",
                    (
                        chunk_id(document, chunk.position),
                        document.id,
                        chunk.position,
                        chunk.text,
                        literal,
                        None if vector is None else model,
                        chunk.document_version,
                    ),
                )
                count += 1
        connection.execute(
            "INSERT INTO kb.index_metadata "
            "(id, mode, embedding_model, dimensions, dataset_version) VALUES (1, %s, %s, %s, %s)",
            (mode, model, EMBEDDING_DIM if model else None, version),
        )
    return count


def make_embedder(settings: Settings):
    from app.embeddings import make_live_embedder

    return make_live_embedder(settings)


async def compute_vectors(embedder, documents: list[Document]) -> dict:
    try:
        return await embed_corpus(embedder, documents)
    finally:
        await embedder.aclose()


def run(
    env: dict,
    corpus_dir: Path = CORPUS_DIR,
    connect=psycopg.connect,
    embedder_factory=make_embedder,
) -> int:
    # Ingest не принимает HTTP-запросы: внутренний токен ему не нужен.
    env = {"INTERNAL_API_TOKEN": "not-used-by-ingest", **env}
    try:
        settings = load_settings(env)
        documents = load_corpus(corpus_dir)
    except (ConfigError, CorpusError) as error:
        print(f"Ошибка входных данных: {error}", file=sys.stderr)
        return EXIT_INPUT

    # В kb записываем полный профиль векторов, а не только имя модели.
    model = embedding_profile(settings) if settings.llm_mode == "live" else None
    version = dataset_version(documents, settings.llm_mode, model)
    try:
        with connect(autocommit=True, connect_timeout=CONNECT_TIMEOUT) as connection:
            if current_version(connection) == version:
                print(f"Индекс kb уже актуален ({version}), изменений нет")
                return EXIT_OK
            vectors = {}
            if model:
                try:
                    vectors = asyncio.run(compute_vectors(embedder_factory(settings), documents))
                except EmbeddingError as error:
                    print(f"Эмбеддинги недоступны: {error}", file=sys.stderr)
                    return EXIT_EMBEDDINGS
            chunks = write_index(connection, documents, vectors, model, version)
    except psycopg.Error as error:
        # Только тип ошибки: в тексте psycopg бывают адрес и имя пользователя БД.
        print(f"Ошибка базы kb: {type(error).__name__}", file=sys.stderr)
        return EXIT_DATABASE

    kind = f"live, {model}, {EMBEDDING_DIM}" if model else "mock, без векторов"
    print(
        f"Индекс kb обновлён: {len(documents)} документов, {chunks} фрагментов ({kind}), {version}"
    )
    return EXIT_OK


if __name__ == "__main__":  # pragma: no cover
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else CORPUS_DIR
    raise SystemExit(run(dict(os.environ), folder))
