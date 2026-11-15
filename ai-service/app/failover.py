"""Two bounded paid attempts, then deterministic help using the same scoped input.

Each run owns its stream state. Cancellation never starts a fallback call. Fallback
notices are ordinary message.delta text: Go persists them in chat without new public
DTOs, and source/tool checks remain in the existing generate pipeline.

Потоковая отдача. Текст модели уходит в чат сразу, кусок за куском: стажёр видит
первые слова через 1.5–3.5 с, а не через весь ответ (раньше ответ буферизовался целиком).
- первый кусок модель должна прислать за first_wait (≤6 с). Не прислала или упала до
  него — в чат ещё ничего не ушло, поэтому пробуем запасную модель, затем offline;
- после первого куска модель уже не меняем: если поток оборвался или затих дольше
  next_wait, уже показанный текст остаётся, а в конце добавляется INTERRUPTED.
Пометки (NOTICE, OFFLINE_NOTICE, INTERRUPTED, MOCK_PREFIX) — фиксированные фразы:
по ним фронтенд отличает ответ ИИ от fallback, не меняя публичный контракт.

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
from app.notices import INTERRUPTED, MOCK_PREFIX, NOTICE, OFFLINE_NOTICE, RESERVE_NOTICE
from app.openai_provider import OpenAIProvider
from app.prompt import LlmInput

logger = logging.getLogger(__name__)

# Сколько секунд не обращаться к модели после её сбоя.
COOLDOWN_SECONDS = 30.0
# Предел длины offline-ответа: вместе с уведомлением влезает в 4000 символов Go.
OFFLINE_LIMIT = 3000
# Предел текста модели: с уведомлением о резерве и об обрыве влезает в 4000 символов Go.
LIVE_LIMIT = 3500


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
        # Происхождение ответа для Go: кто ответил, полный ли ответ, первая причина перехода.
        self.answered_by = "primary"
        self.completion = "complete"
        self.reason_code = None
        now = owner.clock()
        reserve = min(1.0, settings.pipeline_timeout / 10)
        self.pipeline_deadline = now + settings.pipeline_timeout - reserve
        # generate.py переписывает оба срока от момента приёма запроса.
        # token_deadline — до него должен прийти первый кусок текста любой из моделей.
        self.token_deadline = now + settings.first_token_timeout - reserve
        self.iterator = self._run()

    def __aiter__(self):
        return self

    async def __anext__(self):
        return await anext(self.iterator)

    async def aclose(self):
        await self.iterator.aclose()

    def _note(self, reason: str) -> None:
        # Запоминаем первую причину: именно она увела ответ с основной модели.
        if self.reason_code is None:
            self.reason_code = reason

    def origin(self) -> dict:
        origin = {"mode": "live", "answered_by": self.answered_by, "completion": self.completion}
        if self.reason_code is not None and self.answered_by != "primary":
            origin["reason_code"] = self.reason_code
        return origin

    async def _run(self) -> AsyncIterator[str]:
        clock = self.owner.clock
        # Leave time for retrieval and offline text inside the existing first-token
        # budget. Attempts do not extend the outer 85s pipeline / Go 90s deadline.
        first_wait = min(6.0, self.settings.first_token_timeout / 3)
        # Пауза между кусками уже начатого ответа, после которой считаем поток оборванным.
        next_wait = self.settings.stream_idle_timeout / 2
        for index, provider in enumerate(self.providers):
            if not self.owner.is_available(index):
                self.degraded = True
                self._note("cooldown")
                continue
            name = model_name(provider, index)
            chunks = provider.stream(self.llm_input, self.scenario)
            started = False
            live_chars = 0
            budget_denied = False
            first_deadline = min(clock() + first_wait, self.token_deadline, self.pipeline_deadline)
            try:
                while True:
                    if started:
                        deadline = min(clock() + next_wait, self.pipeline_deadline)
                    else:
                        deadline = first_deadline
                    left = deadline - clock()
                    if left <= 0:
                        raise TimeoutError
                    try:
                        text = await asyncio.wait_for(anext(chunks), left)
                    except StopAsyncIteration:
                        if not started:
                            raise ProviderUnavailable("Пустой ответ") from None
                        self.owner.mark_ok(index)
                        return
                    if not text:
                        continue
                    if not started:
                        started = True
                        self.answered_by = "primary" if index == 0 else "secondary"
                        if self.degraded:
                            yield NOTICE + RESERVE_NOTICE
                    # Go permits 4000 characters per message: длинный ответ обрезаем,
                    # а не отбрасываем — его начало стажёр уже видит.
                    room = LIVE_LIMIT - live_chars
                    if len(text) >= room:
                        yield text[:room] + "…"
                        self.owner.mark_ok(index)
                        return
                    live_chars += len(text)
                    yield text
            except (BudgetDenied, BudgetUnavailable):
                budget_denied = True
                self._note("budget_denied")
                logger.warning("LLM %s: платный вызов запрещён журналом расходов", name)
            except (ProviderUnavailable, TimeoutError) as error:
                self.owner.mark_failed(index)
                self._note("timeout" if isinstance(error, TimeoutError) else "model_unavailable")
                # Сообщения ProviderUnavailable пишет наш адаптер (код, тип сбоя), без
                # текста провайдера, поэтому причину можно логировать.
                logger.warning(
                    "LLM %s не ответила (%s: %s), пропускаем её %.0f с",
                    name,
                    type(error).__name__,
                    str(error)[:120],
                    COOLDOWN_SECONDS,
                )
            finally:
                await chunks.aclose()
            self.degraded = True
            if started:
                # Начало ответа уже в чате: другую модель не зовём, только помечаем обрыв.
                self.completion = "interrupted"
                yield INTERRUPTED
                return
            if budget_denied or clock() >= self.pipeline_deadline:
                # A budget refusal cannot be bypassed with another paid model.
                break
        self.offline_fallback = True
        self.answered_by = "offline"
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
