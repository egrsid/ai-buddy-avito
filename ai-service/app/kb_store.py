"""Откуда сервис берёт знания: из файлов (тесты, офлайн) или из индекса kb после ingest.

Вариант B: pgvector — хранилище векторов, а права и ранжирование считаются в Python тем же
кодом, что и в mock (acl.can_read + retrieval). Корпус маленький (7 документов), поэтому
индекс целиком держим в памяти и перечитываем, когда ingest записал новую версию.
"""

import asyncio
import json
import logging
import threading

import psycopg

from app.config import Settings
from app.knowledge import Document, chunk_document
from app.retrieval import KnowledgeBase
from app.vectors import EmbeddingError, embed_corpus

logger = logging.getLogger(__name__)
CONNECT_TIMEOUT = 5


class IndexNotReady(Exception):
    """Индекса нет или он не подходит к настройкам: сервис не должен стартовать."""


class StaticKnowledge:
    """Знания из файлов. В live векторы считаются при старте (7 фрагментов, ~5 с)."""

    def __init__(self, knowledge: KnowledgeBase, embedder=None):
        self.knowledge = knowledge
        self.embedder = embedder

    async def start(self) -> None:
        if self.embedder is None or self.knowledge.vectors:
            return
        documents = list(self.knowledge.documents.values())
        try:
            vectors = await embed_corpus(self.embedder, documents)
        except EmbeddingError:
            logger.warning("Векторы корпуса не посчитаны: поиск будет только лексическим")
            return
        self.knowledge = KnowledgeBase(documents, vectors)

    async def current(self) -> KnowledgeBase:
        return self.knowledge

    async def not_ready_reason(self) -> str | None:
        """None — можно отвечать; иначе короткая причина для /readyz."""
        if not self.knowledge.documents:
            return "корпус знаний пуст"
        return None

    def close(self) -> None:
        """Закрывать нечего: метод нужен, чтобы api закрывал любой источник одинаково."""


def parse_vector(text: str | None) -> list[float] | None:
    """pgvector отдаёт вектор текстом "[0.1,0.2,...]": это валидный JSON."""
    if text is None:
        return None
    return json.loads(text)


def read_revision(connection) -> tuple | None:
    return connection.execute(
        "SELECT dataset_version, indexed_at, mode, embedding_model FROM kb.index_metadata"
    ).fetchone()


def read_index(connection) -> KnowledgeBase:
    documents = []
    rows = connection.execute(
        "SELECT id, title, content, version, visibility, team_id, resource_id, content_hash "
        "FROM kb.documents ORDER BY id"
    ).fetchall()
    for row in rows:
        documents.append(
            Document(
                id=str(row[0]),
                title=row[1],
                content=row[2],
                version=row[3],
                visibility=row[4],
                team_id=row[5],
                resource_id=row[6],
                content_hash=row[7],
            )
        )
    stored = {}
    rows = connection.execute(
        "SELECT document_id, position, content, document_version, embedding::text FROM kb.chunks"
    ).fetchall()
    for row in rows:
        stored[(str(row[0]), row[1])] = (row[2], row[3], parse_vector(row[4]))

    vectors = {}
    for document in documents:
        for chunk in chunk_document(document):
            key = (document.id, chunk.position)
            saved = stored.get(key)
            # Вектор берём, только если фрагмент тот же: иначе он описывает другой текст.
            if saved is None or saved[0] != chunk.text or saved[1] != chunk.document_version:
                raise IndexNotReady("фрагменты в kb не совпадают с документами: нужен ingest")
            if saved[2] is not None:
                vectors[key] = saved[2]
    return KnowledgeBase(documents, vectors)


def check_ready(revision: tuple | None, settings: Settings) -> None:
    if revision is None:
        raise IndexNotReady("индекс kb пуст: запустите python -m app.ingest")
    mode, model = revision[2], revision[3]
    if settings.llm_mode == "live" and mode != "live":
        raise IndexNotReady("LLM_MODE=live, а в kb индекс без векторов: нужен live-ingest")
    # Несовместимые модели не смешиваем: вектор вопроса и векторы фрагментов от одной модели.
    if mode == "live" and model != settings.embedding_model:
        raise IndexNotReady(f"индекс построен моделью {model}, а настроена другая")


class DbKnowledge:
    """Знания из kb. На каждый запрос сверяет версию индекса и перечитывает при смене."""

    def __init__(self, settings: Settings, connect=psycopg.connect):
        self.settings = settings
        self.connect = connect
        self.connection = None
        self.revision = None
        self.knowledge = None
        # psycopg-соединение одно на сервис, а запросы идут из разных потоков.
        self.lock = threading.Lock()

    def query(self, reader):
        with self.lock:
            if self.connection is None:
                # Параметры подключения — из PGHOST/PGUSER/PGPASSWORD/PGDATABASE (роль ai_service).
                self.connection = self.connect(autocommit=True, connect_timeout=CONNECT_TIMEOUT)
            try:
                return reader(self.connection)
            except psycopg.Error:
                self.connection.close()
                self.connection = None
                raise

    def reload(self) -> None:
        revision = self.query(read_revision)
        check_ready(revision, self.settings)
        if revision != self.revision:
            self.knowledge = self.query(read_index)
            self.revision = revision
            logger.info("Индекс kb загружен: версия %s, режим %s", revision[0], revision[2])

    async def start(self) -> None:
        try:
            await asyncio.to_thread(self.reload)
        except psycopg.Error as error:
            raise IndexNotReady(f"kb недоступна: {type(error).__name__}") from error

    async def current(self) -> KnowledgeBase:
        try:
            await asyncio.to_thread(self.reload)
        except (psycopg.Error, IndexNotReady):
            # Отвечаем по последнему загруженному индексу: права всё равно из scope запроса.
            logger.warning("Не удалось сверить индекс kb, используем загруженный")
        return self.knowledge

    async def not_ready_reason(self) -> str | None:
        """Сверяет индекс в kb прямо сейчас: база доступна, индекс есть и подходит к режиму."""
        try:
            await asyncio.to_thread(self.reload)
        except psycopg.Error as error:
            return f"kb недоступна: {type(error).__name__}"
        except IndexNotReady as error:
            return str(error)
        if self.knowledge is None or not self.knowledge.documents:
            return "в индексе kb нет документов"
        return None

    def close(self) -> None:
        with self.lock:
            if self.connection is not None:
                self.connection.close()
                self.connection = None
