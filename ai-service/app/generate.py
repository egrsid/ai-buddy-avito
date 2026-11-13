"""Пайплайн POST /internal/v2/generate: поток SSE-событий для одного run.

Порядок: run.started -> message.delta* -> message.sources -> 0..1 tool.proposed ->
generation.completed. При сбое провайдера вместо конца — run.failed.

Таймеры (монотонные часы):
- первый непустой кусок текста — не позже first_token_timeout после старта;
- следующий кусок — не позже stream_idle_timeout после предыдущего;
- весь пайплайн — не дольше pipeline_timeout.
Пока ждём, каждые ping_interval отдаём ": ping"; ping таймеры не продлевает.
"""

import asyncio
import time
from collections.abc import AsyncIterator, Callable

from app.config import Settings
from app.contracts import is_valid
from app.drafts import propose_access_request
from app.mock_provider import ProviderUnavailable, current_step, invalid_tool_proposal
from app.prompt import LlmInput, build_messages, last_user_message
from app.retrieval import KnowledgeBase, source_for
from app.sse import PING, format_event
from app.vectors import embed_query

# Безопасные тексты для run.failed: без деталей провайдера.
TIMEOUT_MESSAGE = "Модель не ответила вовремя"
UNAVAILABLE_MESSAGE = "Модель временно недоступна"
# Фрагментов в промпт. На CPU каждый новый токен промпта — ~15 мс до первого слова
# ответа, а фрагмент — 200–300 токенов: больше трёх не влезает в 20 с.
GENERATE_TOP_K = 3


class LlmTimeout(Exception):
    pass


async def next_chunk(chunks: AsyncIterator[str]) -> str | None:
    """Следующий кусок текста или None, если провайдер закончил."""
    try:
        return await anext(chunks)
    except StopAsyncIteration:
        return None


def search_query(request: dict) -> str:
    """Запрос к знаниям: последний вопрос стажёра и название текущего шага."""
    query = last_user_message(request)
    goal_context = request.get("goal_context")
    if goal_context is not None:
        step = current_step(goal_context)
        if step is not None:
            query += " " + step["title"]
    return query


def tool_proposal(request: dict, scenario: str) -> dict | None:
    """Не больше одного предложения за run; своё предложение сверяем со схемой."""
    if scenario == "invalid_tool":
        return invalid_tool_proposal(request)
    proposal = propose_access_request(request)
    if proposal is None or not is_valid("ToolProposedEvent", proposal):
        return None
    return proposal


async def run_generate(
    request: dict,
    provider,
    knowledge: KnowledgeBase,
    settings: Settings,
    scenario: str = "normal",
    clock: Callable[[], float] = time.monotonic,
    embedder=None,
    accepted: float | None = None,
) -> AsyncIterator[str]:
    """accepted — время приёма HTTP-запроса по тем же часам clock: от него считаются 85 с."""
    run_id = request["run_id"]
    sequence = 0

    def event(event_type: str, payload: dict) -> str:
        nonlocal sequence
        sequence += 1
        return format_event(event_type, sequence, payload)

    def timeout_event() -> str:
        payload = {"run_id": run_id, "code": "LLM_TIMEOUT", "message": TIMEOUT_MESSAGE}
        return event("run.failed", payload)

    started = clock() if accepted is None else accepted
    pipeline_deadline = started + settings.pipeline_timeout
    token_deadline = started + settings.first_token_timeout

    def too_late() -> bool:
        return clock() >= pipeline_deadline

    yield event("run.started", {"run_id": run_id})

    scope = request["access_scope"]
    query = search_query(request)
    query_vector = None
    if knowledge.vectors:
        query_vector = await embed_query(embedder, query)
    # Фильтр прав внутри search — до ранжирования и до модели.
    hits = knowledge.search(scope, query, GENERATE_TOP_K, query_vector)
    # Эмбеддинг вопроса тоже тратит общий бюджет: проверяем до запроса к модели.
    if too_late():
        yield timeout_event()
        return
    llm_input = LlmInput(build_messages(request, hits), request, hits)
    chunks = provider.stream(llm_input, scenario)
    if hasattr(chunks, "pipeline_deadline"):
        # Give the local notice time to reach Go before the hard pipeline deadline.
        reserve = min(1.0, settings.pipeline_timeout / 10)
        chunks.pipeline_deadline = pipeline_deadline - reserve
        # Буферизованный ответ целиком должен прийти до срока первого токена.
        chunks.answer_deadline = token_deadline - reserve
    pending = None
    try:
        while True:
            pending = asyncio.ensure_future(next_chunk(chunks))
            deadline = min(token_deadline, pipeline_deadline)
            # Ждём кусок порциями по ping_interval, чтобы между ними слать ping.
            while not pending.done():
                left = deadline - clock()
                if left <= 0:
                    raise LlmTimeout()
                await asyncio.wait({pending}, timeout=min(left, settings.ping_interval))
                if not pending.done() and clock() < deadline:
                    yield PING
            text = pending.result()
            pending = None
            if text is None:
                break
            if text:
                token_deadline = clock() + settings.stream_idle_timeout
                yield event("message.delta", {"run_id": run_id, "text": text})
    except LlmTimeout:
        yield timeout_event()
        return
    except ProviderUnavailable:
        yield event(
            "run.failed",
            {"run_id": run_id, "code": "LLM_UNAVAILABLE", "message": UNAVAILABLE_MESSAGE},
        )
        return
    finally:
        # Отменяем недождавшийся запрос к провайдеру (таймаут или обрыв соединения Go).
        if pending is not None and not pending.done():
            pending.cancel()
            # Дожидаемся отмены, иначе генератор провайдера ещё «занят» и не закроется.
            await asyncio.wait({pending})
        await chunks.aclose()

    # Хвост потока. Провайдер мог закончить уже после дедлайна, а каждая отправка события
    # тоже занимает время, поэтому время проверяем перед каждым из трёх событий.
    # Опоздали — ровно один run.failed, и после него ничего.
    if too_late():
        yield timeout_event()
        return
    # Перед выдачей ещё раз проверяем права на каждый источник.
    sources = []
    for hit in hits:
        if knowledge.get(scope, hit.document.id) is not None:
            sources.append(source_for(hit.document, hit.chunk))
    yield event("message.sources", {"run_id": run_id, "sources": sources})
    # A recovered chat response never turns an interrupted model attempt into an
    # action proposal. The intern can use the explicit server-side action preview.
    proposal = None if getattr(chunks, "degraded", False) else tool_proposal(request, scenario)
    if proposal is not None:
        if too_late():
            yield timeout_event()
            return
        yield event("tool.proposed", proposal)
    if too_late():
        yield timeout_event()
        return
    yield event("generation.completed", {"run_id": run_id})
