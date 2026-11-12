"""Векторы без сетевого клиента: общие функции для ingest, поиска и evals.

Отдельно от app.embeddings, чтобы mock-режим не тянул httpx: эмбеддер передаётся
снаружи (OllamaEmbedder в live, fake в тестах).
"""

import asyncio
import logging

from app.config import EMBEDDING_DIM, Settings
from app.knowledge import Document, chunk_document
from app.redaction import redact

logger = logging.getLogger(__name__)
BATCH_SIZE = 16
# Вектор вопроса тёплой моделью — ~50 мс. Дольше ждать нельзя: это время первого токена.
QUERY_TIMEOUT = 3.0


# Версия подготовки текста перед эмбеддингом (очистка секретов и т. п.; нарезку учитывает
# dataset_version). Поменяли подготовку — поднимите, и старый индекс станет непригоден.
EMBEDDING_PREPROCESSING = "p1"


def embedding_profile(settings: Settings) -> str:
    """Профиль векторов: провайдер, модель, размерность, подготовка текста.

    Индекс и вектор вопроса обязаны иметь один профиль: векторы разных провайдеров или
    моделей несравнимы, даже если модель называется одинаково. Смена профиля —
    сервис не готов, пока не прогнан ingest заново. Модель чата и ключ в профиль не входят:
    их смена индекс не трогает.
    """
    return (
        f"{settings.llm_provider}:{settings.embedding_model}:"
        f"{EMBEDDING_DIM}:{EMBEDDING_PREPROCESSING}"
    )


class EmbeddingError(Exception):
    """Эмбеддинги недоступны или пришли не той формы. Текст без ответа провайдера."""


async def embed_corpus(embedder, documents: list[Document]) -> dict[tuple[str, int], list[float]]:
    """Векторы всех фрагментов: (document_id, position) -> вектор. Режет так же, как поиск."""
    chunks = [chunk for document in documents for chunk in chunk_document(document)]
    vectors = {}
    for start in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[start : start + BATCH_SIZE]
        results = await embedder.embed([chunk.text for chunk in batch])
        for chunk, vector in zip(batch, results):
            vectors[(chunk.document_id, chunk.position)] = vector
    return vectors


async def embed_query(embedder, query: str) -> list[float] | None:
    """Вектор вопроса или None: тогда поиск только лексический, а ответ не падает."""
    if embedder is None or not query.strip():
        return None
    try:
        # Вопрос уходит провайдеру, поэтому секреты вычищаем, как и в промпте.
        vectors = await asyncio.wait_for(embedder.embed([redact(query)]), QUERY_TIMEOUT)
    except (EmbeddingError, TimeoutError):
        logger.warning("Вектор вопроса не получен: поиск только лексический")
        return None
    return vectors[0]
