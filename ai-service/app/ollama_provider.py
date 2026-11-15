"""Live-провайдер для Ollama через нативный /api/chat (LLM_MODE=live, LLM_PROVIDER=ollama).

Почему нативный API, а не OpenAI-совместимый /v1: только здесь в каждом запросе можно
задать окно контекста (options.num_ctx), выключить размышления (think) и продлить жизнь
модели в памяти (keep_alive). Без явного num_ctx Ollama берёт дефолт машины (4096) и при
переполнении молча обрезает начало промпта, то есть системные правила.

Интерфейс тот же, что у MockProvider: stream() отдаёт куски текста, при недоступности
бросает ProviderUnavailable. Таймеры ответа (20/25/85 с) держит пайплайн generate.
"""

import json
import logging
from collections.abc import AsyncIterator

import httpx

from app.config import Settings
from app.mock_provider import ProviderUnavailable
from app.prompt import SYSTEM_PROMPT, LlmInput

logger = logging.getLogger(__name__)
CONNECT_TIMEOUT = 5.0


class OllamaProvider:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        # read-таймаут — только страховка от зависшего соединения: раньше сработает пайплайн.
        timeout = httpx.Timeout(settings.pipeline_timeout, connect=CONNECT_TIMEOUT)
        # Ollama всегда рядом (хост или host.docker.internal). Без trust_env=False httpx
        # берёт системный прокси Windows/VPN и шлёт туда даже localhost -> 502.
        self.client = httpx.AsyncClient(
            base_url=settings.llm_base_url, timeout=timeout, transport=transport, trust_env=False
        )

    def chat_body(self, messages: list[dict], max_tokens: int) -> dict:
        return {
            "model": self.settings.llm_model,
            "messages": messages,
            "stream": True,
            # Размышления на CPU стоят десятки секунд до первого слова ответа.
            "think": False,
            "keep_alive": self.settings.llm_keep_alive,
            # num_ctx одинаковый во всех запросах: смена значения перезагружает модель.
            "options": {"num_ctx": self.settings.llm_num_ctx, "num_predict": max_tokens},
        }

    async def stream(self, llm_input: LlmInput, scenario: str) -> AsyncIterator[str]:
        # scenario не нужен: X-Mock-Scenario разрешён только в mock-режиме.
        limit = llm_input.output_limit(self.settings.llm_max_output_tokens)
        body = self.chat_body(llm_input.messages, limit)
        async for text in self.chat(body):
            yield text

    async def chat(self, body: dict, check_usage: bool = True) -> AsyncIterator[str]:
        """Читает поток Ollama: одна JSON-строка на кусок, последняя — с done=true."""
        try:
            async with self.client.stream("POST", "/api/chat", json=body) as response:
                if response.status_code != 200:
                    raise ProviderUnavailable(f"Ollama ответила кодом {response.status_code}")
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    if "error" in data:
                        # Текст ошибки провайдера не пробрасываем и не логируем.
                        raise ProviderUnavailable("Ollama вернула ошибку в потоке")
                    text = data.get("message", {}).get("content", "")
                    if text:
                        yield text
                    if data.get("done") and check_usage:
                        self.log_usage(data)
        except httpx.HTTPError as error:
            raise ProviderUnavailable(f"Ollama недоступна: {type(error).__name__}") from error
        except ValueError as error:
            raise ProviderUnavailable("Ollama прислала не JSON") from error

    def log_usage(self, data: dict) -> None:
        """Предупреждает о молчаливой обрезке промпта и об оборванном ответе. Только числа."""
        prompt_tokens = data.get("prompt_eval_count", 0)
        if prompt_tokens + self.settings.llm_max_output_tokens > self.settings.llm_num_ctx:
            logger.warning(
                "Промпт %s токенов почти не помещается в окно %s: Ollama могла обрезать начало",
                prompt_tokens,
                self.settings.llm_num_ctx,
            )
        if data.get("done_reason") == "length":
            logger.warning(
                "Ответ оборван на лимите LLM_MAX_OUTPUT_TOKENS=%s",
                self.settings.llm_max_output_tokens,
            )

    async def warm_up(self) -> None:
        """Загружает модель и кэширует системный промпт до первого вопроса стажёра.

        Замер на CPU: холодный старт даёт первый токен через ~24 с (загрузка ~8 с + чтение
        промпта), а контракт требует 20 с. После прогрева — ~3 с.
        """
        body = self.chat_body([{"role": "system", "content": SYSTEM_PROMPT}], 1)
        try:
            # Ответ в 1 токен оборван намеренно: предупреждения о лимитах здесь лишние.
            async for _ in self.chat(body, check_usage=False):
                pass
            logger.info("Модель %s прогрета", self.settings.llm_model)
        except ProviderUnavailable:
            logger.warning("Прогрев не удался: Ollama недоступна, первый ответ будет медленным")

    async def aclose(self) -> None:
        await self.client.aclose()
