"""Платный API через OpenAI-совместимый /v1 (LLM_MODE=live, LLM_PROVIDER=openai).

Для MVP это Cloud.ru: чат `ai-sage/GigaChat3.5-432B-A28B`, эмбеддинги `BAAI/bge-m3`,
один ключ (LLM_API_KEY) и один LLM_BASE_URL. Тот же протокол умеет и Ollama (/v1),
поэтому адаптер проверяется локально без денег.

Каждый вызов идёт через журнал расходов (app.budget): резерв до запроса, факт по usage.
Бюджет исчерпан или журнал сломан — запроса к провайдеру нет, наружу уходит
ProviderUnavailable (в SSE это run.failed LLM_UNAVAILABLE) или EmbeddingError
(поиск тогда только лексический). Интерфейс тот же, что у OllamaProvider/OllamaEmbedder.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator

import httpx

from app.budget import BudgetLedger, BudgetUnavailable, cost_rub, ensure_ledger, upper_tokens
from app.config import EMBEDDING_DIM, Settings
from app.mock_provider import ProviderUnavailable
from app.prompt import LlmInput
from app.vectors import EmbeddingError

logger = logging.getLogger(__name__)
CONNECT_TIMEOUT = 5.0
# Ingest шлёт корпус пачками; удалённому API хватает с запасом.
EMBED_READ_TIMEOUT = 60.0
# Паузы перед повторами эмбеддингов: всего до 3 попыток, задержка ≤2.5 с (лимит токена 20 с).
EMBED_RETRY_DELAYS = (0.5, 2.0)


def make_client(settings: Settings, read_timeout: float, transport) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.llm_base_url,
        timeout=httpx.Timeout(read_timeout, connect=CONNECT_TIMEOUT),
        headers={"Authorization": f"Bearer {settings.llm_api_key}"},
        transport=transport,
        # Системный прокси Windows/VPN не используем: ходим к провайдеру напрямую.
        trust_env=False,
    )


def make_ledger(settings: Settings) -> BudgetLedger:
    """Журнал расходов на старте сервиса/ingest; при первом запуске он создаётся."""
    ensure_ledger(settings.budget_ledger_path)
    return BudgetLedger(settings.budget_ledger_path, settings.budget_stop_rub)


class OpenAIProvider:
    def __init__(
        self,
        settings: Settings,
        ledger: BudgetLedger | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.settings = settings
        self.ledger = ledger or make_ledger(settings)
        # read-таймаут — страховка от зависшего соединения: раньше сработает пайплайн.
        self.client = make_client(settings, settings.pipeline_timeout, transport)

    def upper_cost(self, messages: list[dict]) -> float:
        """Верхняя цена вызова: весь промпт по байтам + полный лимит ответа."""
        prompt = upper_tokens([message["content"] for message in messages])
        input_cost = cost_rub(prompt, self.settings.price_input_rub)
        output_cost = cost_rub(self.settings.llm_max_output_tokens, self.settings.price_output_rub)
        return input_cost + output_cost

    def actual_cost(self, usage: dict) -> float:
        input_cost = cost_rub(usage.get("prompt_tokens", 0), self.settings.price_input_rub)
        output_cost = cost_rub(usage.get("completion_tokens", 0), self.settings.price_output_rub)
        return input_cost + output_cost

    async def stream(self, llm_input: LlmInput, scenario: str) -> AsyncIterator[str]:
        # scenario не нужен: X-Mock-Scenario разрешён только в mock-режиме.
        body = {
            "model": self.settings.llm_model,
            "messages": llm_input.messages,
            "stream": True,
            "max_tokens": self.settings.llm_max_output_tokens,
            # Последним куском провайдер пришлёт usage — по нему считаем факт расходов.
            "stream_options": {"include_usage": True},
        }
        if self.settings.llm_reasoning_effort:
            body["reasoning_effort"] = self.settings.llm_reasoning_effort
        try:
            reservation = self.ledger.reserve("chat", self.upper_cost(llm_input.messages))
        except BudgetUnavailable as error:
            raise ProviderUnavailable(f"Платный вызов запрещён: {error}") from error
        async for text in self.chat(body, reservation):
            yield text

    async def chat(self, body: dict, reservation: str) -> AsyncIterator[str]:
        """Читает SSE: строки `data: {json}`, конец — `data: [DONE]`.

        Cloud.ru шлёт накопленный usage в каждом куске, OpenAI — только в последнем.
        Поэтому факт записываем один раз, после конца потока, по последнему usage.
        Поток оборван (отмена, ошибка) — до записи не доходим, резерв остаётся.
        """
        last_usage = None
        try:
            async with self.client.stream("POST", "/chat/completions", json=body) as response:
                if response.status_code != 200:
                    raise ProviderUnavailable(f"API ответил кодом {response.status_code}")
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line.removeprefix("data:").strip()
                    if data == "[DONE]":
                        break
                    chunk = json.loads(data)
                    if "error" in chunk:
                        # Текст ошибки провайдера не пробрасываем и не логируем.
                        raise ProviderUnavailable("API вернул ошибку в потоке")
                    for choice in chunk.get("choices") or []:
                        # Только content: служебные «размышления» модели текстом не считаем.
                        text = (choice.get("delta") or {}).get("content") or ""
                        if text:
                            yield text
                        if choice.get("finish_reason") == "length":
                            logger.warning(
                                "Ответ оборван на лимите LLM_MAX_OUTPUT_TOKENS=%s",
                                self.settings.llm_max_output_tokens,
                            )
                    if chunk.get("usage"):
                        last_usage = chunk["usage"]
        except httpx.HTTPError as error:
            raise ProviderUnavailable(f"API недоступен: {type(error).__name__}") from error
        except ValueError as error:
            raise ProviderUnavailable("API прислал не JSON") from error
        if last_usage is not None:
            self.settle(reservation, last_usage)

    def settle(self, reservation: str, usage: dict) -> None:
        cost = self.actual_cost(usage)
        self.ledger.settle(reservation, cost)
        logger.info(
            "LLM usage: вход %s, выход %s токенов, ~%.4f ₽",
            usage.get("prompt_tokens"),
            usage.get("completion_tokens"),
            cost,
        )

    async def warm_up(self) -> None:
        """Удалённая модель всегда загружена, а прогрев стоил бы денег — пропускаем."""

    async def aclose(self) -> None:
        await self.client.aclose()


class OpenAIEmbedder:
    def __init__(
        self,
        settings: Settings,
        ledger: BudgetLedger | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        retry_delays: tuple[float, ...] = EMBED_RETRY_DELAYS,
    ):
        self.settings = settings
        self.ledger = ledger or make_ledger(settings)
        self.client = make_client(settings, EMBED_READ_TIMEOUT, transport)
        self.retry_delays = retry_delays

    async def embed(self, texts: list[str]) -> list[list[float]]:
        upper = cost_rub(upper_tokens(texts), self.settings.price_embedding_rub)
        try:
            reservation = self.ledger.reserve("embedding", upper)
        except BudgetUnavailable as error:
            raise EmbeddingError(f"Платный вызов запрещён: {error}") from error
        body = {"model": self.settings.embedding_model, "input": texts}
        try:
            response = await self.post_with_retries(body)
        except httpx.HTTPError as error:
            raise EmbeddingError(f"API недоступен: {type(error).__name__}") from error
        if response.status_code != 200:
            raise EmbeddingError(f"API ответил кодом {response.status_code}")
        try:
            payload = response.json()
            items = sorted(payload["data"], key=lambda item: item["index"])
            vectors = [item["embedding"] for item in items]
        except (ValueError, KeyError, TypeError) as error:
            raise EmbeddingError("API прислал ответ без embeddings") from error
        usage = payload.get("usage") or {}
        if "prompt_tokens" in usage:
            actual = cost_rub(usage["prompt_tokens"], self.settings.price_embedding_rub)
            self.ledger.settle(reservation, actual)
        if len(vectors) != len(texts):
            raise EmbeddingError("число векторов не совпадает с числом текстов")
        for vector in vectors:
            if len(vector) != EMBEDDING_DIM:
                raise EmbeddingError(f"размерность {len(vector)}, ожидалась {EMBEDDING_DIM}")
        return vectors

    async def post_with_retries(self, body: dict) -> httpx.Response:
        """Повтор при 5xx и обрыве связи: у Cloud.ru бывают разовые 500/503 на эмбеддингах.

        Ошибки 4xx (ключ, модель, лимит) не повторяем — повтор их не исправит.
        Последняя попытка возвращает ответ или исключение как есть.
        """
        for delay in self.retry_delays:
            try:
                response = await self.client.post("/embeddings", json=body)
            except httpx.HTTPError:
                await asyncio.sleep(delay)
                continue
            if response.status_code < 500:
                return response
            await asyncio.sleep(delay)
        return await self.client.post("/embeddings", json=body)

    async def warm_up(self) -> None:
        """Удалённой модели прогрев не нужен."""

    async def aclose(self) -> None:
        await self.client.aclose()
