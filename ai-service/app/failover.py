"""Two bounded paid attempts, then deterministic help using the same scoped input.

Each run owns its stream state. Cancellation never starts a fallback call. Each live
attempt is buffered until a successful EOF, so failed partial text never enters chat.
Fallback notices are ordinary message.delta text: Go persists them in chat without
new public DTOs, and source/tool checks remain in the existing generate pipeline.
"""

import asyncio
import time
from collections.abc import AsyncIterator
from dataclasses import replace

from app.budget import BudgetUnavailable
from app.config import Settings
from app.mock_provider import BudgetDenied, ProviderUnavailable, mock_answer
from app.openai_provider import OpenAIProvider
from app.prompt import LlmInput

NOTICE = (
    "Произошла ошибка обращения к LLM. Работает fallback. "
    "Обратись к своему наставнику напрямую для решения вопроса. "
)
OFFLINE_NOTICE = (
    "Ответ ниже подготовлен без LLM по разрешённому контексту и шаблонам. "
    "Он не подтверждает выполнение шага.\n\n"
)


class FailoverStream:
    def __init__(self, providers, llm_input: LlmInput, scenario: str, settings: Settings):
        self.providers = providers
        self.llm_input = llm_input
        self.scenario = scenario
        self.settings = settings
        self.degraded = False
        self.offline_fallback = False
        self.pipeline_deadline = (
            time.monotonic() + settings.pipeline_timeout - min(1.0, settings.pipeline_timeout / 10)
        )
        self.iterator = self._run()

    def __aiter__(self):
        return self

    async def __anext__(self):
        return await anext(self.iterator)

    async def aclose(self):
        await self.iterator.aclose()

    async def _run(self) -> AsyncIterator[str]:
        # Leave time for retrieval and offline text inside the existing first-token
        # budget. Attempts do not extend the outer 85s pipeline / Go 90s deadline.
        first_wait = min(6.0, self.settings.first_token_timeout / 3)
        for index, provider in enumerate(self.providers):
            chunks = provider.stream(self.llm_input, self.scenario)
            buffered = []
            live_chars = 0
            budget_denied = False
            deadline = time.monotonic() + first_wait
            try:
                while True:
                    left = min(deadline, self.pipeline_deadline) - time.monotonic()
                    if left <= 0:
                        raise TimeoutError
                    try:
                        text = await asyncio.wait_for(anext(chunks), left)
                    except StopAsyncIteration:
                        if not buffered:
                            raise ProviderUnavailable("Пустой ответ") from None
                        if index:
                            yield NOTICE + "Используется резервная модель.\n\n"
                        for piece in buffered:
                            yield piece
                        return
                    if time.monotonic() >= deadline:
                        raise TimeoutError
                    if not text:
                        continue
                    # Go permits 4000 characters per message. Keep room for a
                    # durable failure notice and bounded deterministic guidance.
                    if live_chars + len(text) > 2000:
                        raise ProviderUnavailable("Ответ слишком длинный")
                    live_chars += len(text)
                    buffered.append(text)
            except (BudgetDenied, BudgetUnavailable):
                budget_denied = True
            except (ProviderUnavailable, TimeoutError):
                pass
            finally:
                await chunks.aclose()
            self.degraded = True
            if budget_denied or time.monotonic() >= self.pipeline_deadline:
                # A budget refusal cannot be bypassed with another paid model.
                break
        self.offline_fallback = True
        yield NOTICE + OFFLINE_NOTICE
        yield mock_answer(self.llm_input)[:1200]


class FailoverProvider:
    def __init__(self, settings: Settings, providers=None):
        self.settings = settings
        if providers is None:
            primary = OpenAIProvider(settings)
            providers = (primary,)
            if settings.llm_fallback_model:
                secondary_settings = replace(
                    settings,
                    llm_model=settings.llm_fallback_model,
                    price_input_rub=settings.fallback_price_input_rub,
                    price_output_rub=settings.fallback_price_output_rub,
                )
                secondary = OpenAIProvider(secondary_settings, ledger=primary.ledger)
                providers = (primary, secondary)
        self.providers = providers

    def stream(self, llm_input: LlmInput, scenario: str) -> FailoverStream:
        return FailoverStream(self.providers, llm_input, scenario, self.settings)

    async def warm_up(self):
        await asyncio.gather(*(provider.warm_up() for provider in self.providers))

    async def aclose(self):
        await asyncio.gather(*(provider.aclose() for provider in self.providers))
