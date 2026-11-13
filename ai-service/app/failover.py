"""Two bounded paid attempts, then deterministic help using the same scoped input.

Each run owns its stream state. Cancellation never starts a fallback call. Each live
attempt is buffered until a successful EOF, so failed partial text never enters chat.
Fallback notices are ordinary message.delta text: Go persists them in chat without
new public DTOs, and source/tool checks remain in the existing generate pipeline.

Время попытки. Пока ответ буферизуется, Go не видит ни одного куска, поэтому весь
ответ (а не только первый токен) обязан уложиться в первые 20 с пайплайна:
- первый кусок модель должна прислать за first_wait (≤6 с) — так мёртвая или
  зависшая модель распознаётся быстро;
- дописывать ответ попытка может до answer_deadline, но не последняя попытка
  оставляет first_wait запасной модели. Полный ответ GigaChat — p95 5.7 с, поэтому
  обрезать его по 6 с нельзя: здоровый ответ уходил бы в запасную модель и стоил вдвое.

Автомат (circuit breaker). Упавшая модель пропускается COOLDOWN_SECONDS: во время
сбоя Cloud.ru запросы не ждут её заново, а сразу идут в запасную или offline. После
паузы модель пробуется снова; первый успешный ответ возвращает её в работу.
"""

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Callable
from dataclasses import replace

from app.budget import BudgetUnavailable
from app.config import Settings
from app.mock_provider import BudgetDenied, ProviderUnavailable, mock_answer
from app.openai_provider import OpenAIProvider
from app.prompt import LlmInput

logger = logging.getLogger(__name__)

NOTICE = (
    "Произошла ошибка обращения к LLM. Работает fallback. "
    "Обратись к своему наставнику напрямую для решения вопроса. "
)
OFFLINE_NOTICE = (
    "Ответ ниже подготовлен без LLM по разрешённому контексту и шаблонам. "
    "Он не подтверждает выполнение шага.\n\n"
)
# Сколько секунд не обращаться к модели после её сбоя.
COOLDOWN_SECONDS = 30.0
# Предел длины offline-ответа: вместе с уведомлением влезает в 4000 символов Go.
OFFLINE_LIMIT = 3000
# Начало шаблонного ответа mock-режима: здесь о режиме уже сказано в OFFLINE_NOTICE.
MOCK_PREFIX = "Демо-режим mock: ответ подготовлен без LLM.\n\n"


def model_name(provider, index: int) -> str:
    """Имя модели для логов: ключ и тексты запроса в лог не попадают."""
    settings = getattr(provider, "settings", None)
    if settings is not None:
        return settings.llm_model
    return f"модель №{index + 1}"


def offline_text(llm_input: LlmInput) -> str:
    """Шаблонный ответ без LLM: целые абзацы (ссылки и шаги не рвутся), а если не влез
    даже первый абзац — обрезка по концу предложения, а не посреди слова."""
    text = mock_answer(llm_input).removeprefix(MOCK_PREFIX)
    if len(text) <= OFFLINE_LIMIT:
        return text
    parts = []
    for part in text.split("\n\n"):
        if len("\n\n".join([*parts, part])) > OFFLINE_LIMIT:
            break
        parts.append(part)
    if parts:
        return "\n\n".join(parts)
    cut = text[:OFFLINE_LIMIT]
    end = cut.rfind(". ")
    if end > 0:
        return cut[: end + 1]
    return cut.rsplit(" ", 1)[0] + "…"


class FailoverStream:
    def __init__(
        self,
        owner: "FailoverProvider",
        llm_input: LlmInput,
        scenario: str,
        settings: Settings,
    ):
        self.owner = owner
        self.providers = owner.providers
        self.llm_input = llm_input
        self.scenario = scenario
        self.settings = settings
        self.degraded = False
        self.offline_fallback = False
        now = owner.clock()
        reserve = min(1.0, settings.pipeline_timeout / 10)
        self.pipeline_deadline = now + settings.pipeline_timeout - reserve
        # generate.py переписывает оба срока от момента приёма запроса.
        self.answer_deadline = now + settings.first_token_timeout - reserve
        self.iterator = self._run()

    def __aiter__(self):
        return self

    async def __anext__(self):
        return await anext(self.iterator)

    async def aclose(self):
        await self.iterator.aclose()

    def attempt_deadline(self, index: int, first_wait: float, first_deadline: float) -> float:
        """До какого момента попытка может дописывать ответ."""
        deadline = min(self.answer_deadline, self.pipeline_deadline)
        later = range(index + 1, len(self.providers))
        if any(self.owner.is_available(i) for i in later):
            # Не последняя живая попытка: оставляем запасной модели время на первый кусок,
            # но и у этой попытки не отнимаем её окно первого куска.
            deadline = max(deadline - first_wait, first_deadline)
        return deadline

    async def _run(self) -> AsyncIterator[str]:
        clock = self.owner.clock
        # Leave time for retrieval and offline text inside the existing first-token
        # budget. Attempts do not extend the outer 85s pipeline / Go 90s deadline.
        first_wait = min(6.0, self.settings.first_token_timeout / 3)
        for index, provider in enumerate(self.providers):
            if not self.owner.is_available(index):
                self.degraded = True
                continue
            name = model_name(provider, index)
            chunks = provider.stream(self.llm_input, self.scenario)
            buffered = []
            live_chars = 0
            budget_denied = False
            first_deadline = clock() + first_wait
            answer_deadline = self.attempt_deadline(index, first_wait, first_deadline)
            try:
                while True:
                    if buffered:
                        deadline = answer_deadline
                    else:
                        deadline = min(first_deadline, answer_deadline)
                    left = deadline - clock()
                    if left <= 0:
                        raise TimeoutError
                    try:
                        text = await asyncio.wait_for(anext(chunks), left)
                    except StopAsyncIteration:
                        if not buffered:
                            raise ProviderUnavailable("Пустой ответ") from None
                        self.owner.mark_ok(index)
                        if self.degraded:
                            yield NOTICE + "Используется резервная модель.\n\n"
                        for piece in buffered:
                            yield piece
                        return
                    if clock() >= deadline:
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
                logger.warning("LLM %s: платный вызов запрещён журналом расходов", name)
            except (ProviderUnavailable, TimeoutError) as error:
                self.owner.mark_failed(index)
                logger.warning(
                    "LLM %s не ответила (%s), пропускаем её %.0f с",
                    name,
                    type(error).__name__,
                    COOLDOWN_SECONDS,
                )
            finally:
                await chunks.aclose()
            self.degraded = True
            if budget_denied or clock() >= self.pipeline_deadline:
                # A budget refusal cannot be bypassed with another paid model.
                break
        self.offline_fallback = True
        logger.warning("Все LLM недоступны: отвечаем шаблоном без LLM")
        yield NOTICE + OFFLINE_NOTICE
        yield offline_text(self.llm_input)


class FailoverProvider:
    def __init__(
        self,
        settings: Settings,
        providers=None,
        clock: Callable[[], float] = time.monotonic,
        cooldown: float = COOLDOWN_SECONDS,
    ):
        self.settings = settings
        self.clock = clock
        self.cooldown = cooldown
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
        # Номер модели -> до какого момента её пропускать. Общее для всех запросов.
        self.skip_until = {}

    def is_available(self, index: int) -> bool:
        return self.clock() >= self.skip_until.get(index, 0.0)

    def mark_failed(self, index: int) -> None:
        self.skip_until[index] = self.clock() + self.cooldown

    def mark_ok(self, index: int) -> None:
        self.skip_until.pop(index, None)

    def stream(self, llm_input: LlmInput, scenario: str) -> FailoverStream:
        return FailoverStream(self, llm_input, scenario, self.settings)

    async def warm_up(self):
        await asyncio.gather(*(provider.warm_up() for provider in self.providers))

    async def aclose(self):
        await asyncio.gather(*(provider.aclose() for provider in self.providers))
