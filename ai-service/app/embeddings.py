"""Эмбеддинги через Ollama /api/embed (модель bge-m3, 1024 числа на текст).

Клиент нужен только live-режиму (httpx), общие функции — в app.vectors.
Префиксы-инструкции bge-m3 не нужны: вопрос и фрагмент отправляем как есть.
"""

import logging

import httpx

from app.config import EMBEDDING_DIM, Settings
from app.vectors import EmbeddingError

logger = logging.getLogger(__name__)
CONNECT_TIMEOUT = 5.0
# Ingest шлёт корпус пачками: на CPU с загрузкой модели первая пачка ~10 с.
READ_TIMEOUT = 120.0


class OllamaEmbedder:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        timeout = httpx.Timeout(READ_TIMEOUT, connect=CONNECT_TIMEOUT)
        # Как у чата: Ollama рядом, системный прокси Windows её перехватывает.
        self.client = httpx.AsyncClient(
            base_url=settings.llm_base_url, timeout=timeout, transport=transport, trust_env=False
        )

    async def embed(self, texts: list[str]) -> list[list[float]]:
        body = {
            "model": self.settings.embedding_model,
            "input": texts,
            "keep_alive": self.settings.llm_keep_alive,
        }
        try:
            response = await self.client.post("/api/embed", json=body)
        except httpx.HTTPError as error:
            raise EmbeddingError(f"Ollama недоступна: {type(error).__name__}") from error
        if response.status_code != 200:
            raise EmbeddingError(f"Ollama ответила кодом {response.status_code}")
        try:
            vectors = response.json()["embeddings"]
        except (ValueError, KeyError) as error:
            raise EmbeddingError("Ollama прислала ответ без embeddings") from error
        if len(vectors) != len(texts):
            raise EmbeddingError("число векторов не совпадает с числом текстов")
        for vector in vectors:
            if len(vector) != EMBEDDING_DIM:
                raise EmbeddingError(f"размерность {len(vector)}, ожидалась {EMBEDDING_DIM}")
        return vectors

    async def warm_up(self) -> None:
        """Загружает модель эмбеддингов заранее: холодная загрузка bge-m3 ~5 с."""
        try:
            await self.embed(["прогрев"])
            logger.info("Модель эмбеддингов %s прогрета", self.settings.embedding_model)
        except EmbeddingError:
            logger.warning("Прогрев эмбеддингов не удался: поиск будет только лексическим")

    async def aclose(self) -> None:
        await self.client.aclose()
