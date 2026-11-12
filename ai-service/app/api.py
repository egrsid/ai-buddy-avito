"""HTTP-приложение AI-сервиса: маршруты без бизнес-логики, она в отдельных модулях."""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app import operations
from app.config import Settings
from app.contracts import error_fields
from app.drafts import access_request_draft
from app.errors import ApiError, error_response
from app.generate import run_generate
from app.kb_store import DbKnowledge, StaticKnowledge
from app.knowledge import load_corpus
from app.mock_provider import MockProvider
from app.request_checks import (
    check_auth,
    mock_scenario,
    raise_for_scenario,
    read_internal_request,
    read_scope_header,
)
from app.retrieval import KnowledgeBase, source_for
from app.vectors import embed_query

PREFIX = "/internal/v2"
HEALTH = {"status": "ok", "service": "ai-service"}
TIMEOUT_MESSAGE = "Модель не ответила вовремя"
# Ответ не прошёл свою схему. Отдельного кода в контракте нет: для Go это сбой AI,
# как LLM_UNAVAILABLE, и по такому ответу Action не создаётся.
BROKEN_RESPONSE_MESSAGE = "AI-сервис не смог подготовить корректный ответ"

logger = logging.getLogger(__name__)


def json_response(content: dict, request_id: str) -> JSONResponse:
    return JSONResponse(content=content, headers={"X-Request-ID": request_id})


def check_response(definition: str, result: dict, request_id: str) -> None:
    """Перед 200 сверяем свой ответ со схемой: невалидное наружу не уходит."""
    fields = error_fields(definition, result)
    if fields:
        # В лог — только имена полей и правила, без значений.
        logger.error("Ответ %s не прошёл схему: %s", definition, fields)
        raise ApiError(503, "LLM_UNAVAILABLE", BROKEN_RESPONSE_MESSAGE, request_id)


async def within_budget(
    work: Callable[[], Awaitable], accepted: float, budget: float, request_id: str
):
    """Выполняет work() не дольше budget секунд от приёма запроса, иначе 504 LLM_TIMEOUT."""
    left = budget - (time.monotonic() - accepted)
    if left <= 0:
        raise ApiError(504, "LLM_TIMEOUT", TIMEOUT_MESSAGE, request_id)
    try:
        return await asyncio.wait_for(work(), left)
    except TimeoutError:
        raise ApiError(504, "LLM_TIMEOUT", TIMEOUT_MESSAGE, request_id) from None


def make_provider(settings: Settings):
    if settings.llm_mode == "live":
        # Импорт здесь: httpx нужен только live-режиму, mock должен стартовать и без него.
        if settings.llm_provider == "openai":
            from app.openai_provider import OpenAIProvider

            return OpenAIProvider(settings)
        from app.ollama_provider import OllamaProvider

        return OllamaProvider(settings)
    return MockProvider(slow_stream_delay=settings.slow_stream_delay)


def make_embedder(settings: Settings):
    """Эмбеддер вопросов и корпуса — только в live; в mock поиск лексический."""
    if settings.llm_mode != "live":
        return None
    from app.embeddings import make_live_embedder

    return make_live_embedder(settings)


def make_knowledge_source(settings: Settings, embedder):
    if settings.knowledge_source == "db":
        return DbKnowledge(settings)
    return StaticKnowledge(KnowledgeBase(load_corpus()), embedder)


def create_app(
    settings: Settings,
    provider=None,
    knowledge: KnowledgeBase | None = None,
    embedder=None,
    source=None,
):
    """knowledge — готовый индекс (тесты); source — свой источник; иначе по настройкам."""
    if provider is None:
        provider = make_provider(settings)
    if embedder is None:
        embedder = make_embedder(settings)
    if source is None and knowledge is not None:
        source = StaticKnowledge(knowledge, embedder)
    if source is None:
        source = make_knowledge_source(settings, embedder)

    async def warm_up_models() -> None:
        if embedder is None:
            await provider.warm_up()
        else:
            await asyncio.gather(provider.warm_up(), embedder.warm_up())

    # Задача прогрева создаётся при старте; /readyz ждёт её завершения.
    warming = []

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Индекс — до приёма запросов: без него (KNOWLEDGE_SOURCE=db) сервис не стартует.
        await source.start()
        # Прогрев в фоне: /healthz отвечает сразу, а /readyz — только после прогрева,
        # иначе первый вопрос на CPU не уложится в 20 с до первого токена.
        task = asyncio.create_task(warm_up_models())
        warming.append(task)
        yield
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        await provider.aclose()
        if embedder is not None:
            await embedder.aclose()
        source.close()

    app = FastAPI(
        title="AI-buddy internal AI",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )

    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, error: ApiError):
        return error_response(error)

    @app.get("/healthz")
    def health() -> dict[str, str]:
        return HEALTH

    @app.get("/readyz")
    async def ready():
        """Готовность для compose: индекс знаний годен и модели прогреты.

        /healthz — только «процесс жив». Причина неготовности — короткий текст без данных.
        """
        reason = await source.not_ready_reason()
        if reason is None and (not warming or not warming[0].done()):
            reason = "модели ещё прогреваются"
        if reason is not None:
            body = {"status": "not_ready", "service": "ai-service", "reason": reason}
            return JSONResponse(status_code=503, content=body)
        return HEALTH

    @app.post(f"{PREFIX}/generate")
    async def generate(request: Request):
        accepted = time.monotonic()
        # Все проверки — до первого байта потока: потом статус уже не изменить.
        request_id, body = await read_internal_request(request, settings, "GenerateRequest")
        scenario = mock_scenario(request, settings, request_id)
        knowledge = await source.current()
        stream = run_generate(
            body, provider, knowledge, settings, scenario, embedder=embedder, accepted=accepted
        )
        return StreamingResponse(
            stream,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "X-Request-ID": request_id,
            },
        )

    async def structured(
        request: Request,
        definition: str,
        response_definition: str,
        handler: Callable[[dict], Awaitable[dict | None]],
    ):
        """Общий путь непотоковой операции.

        Проверки запроса -> mock-сбой -> handler в бюджете 85 с -> проверка ответа по схеме.
        handler вернул None — разрешённых данных нет, это 404.
        """
        accepted = time.monotonic()
        request_id, body = await read_internal_request(request, settings, definition)
        raise_for_scenario(mock_scenario(request, settings, request_id), request_id)

        def work():
            return handler(body)

        result = await within_budget(work, accepted, settings.pipeline_timeout, request_id)
        if result is None:
            raise ApiError(404, "NOT_FOUND", "Нет доступных данных", request_id)
        check_response(response_definition, result, request_id)
        return json_response(result, request_id)

    async def select_journey(body: dict) -> dict:
        return operations.select_journey(body)

    async def draft_access_request(body: dict) -> dict:
        return access_request_draft(body)

    async def classify_error(body: dict) -> dict:
        return operations.classify_error(body)

    async def summarize_diagnostics(body: dict) -> dict:
        knowledge = await source.current()
        return operations.diagnostic_summary(body, knowledge)

    async def draft_knowledge_gap(body: dict) -> dict | None:
        knowledge = await source.current()
        return operations.knowledge_gap_draft(body, knowledge)

    async def search_knowledge(body: dict) -> dict:
        knowledge = await source.current()
        query_vector = None
        if knowledge.vectors:
            query_vector = await embed_query(embedder, body["query"])
        scope = body["access_scope"]
        hits = knowledge.search(scope, body["query"], body.get("top_k", 5), query_vector)
        return {"sources": [source_for(hit.document, hit.chunk) for hit in hits]}

    @app.post(f"{PREFIX}/journey-selection")
    async def journey_selection(request: Request):
        return await structured(
            request, "JourneySelectionRequest", "JourneySelectionResponse", select_journey
        )

    @app.post(f"{PREFIX}/access-request-draft")
    async def draft(request: Request):
        return await structured(
            request, "AccessRequestDraftRequest", "AccessRequestDraftResponse", draft_access_request
        )

    @app.post(f"{PREFIX}/classify-error")
    async def classify(request: Request):
        return await structured(
            request, "ClassifyErrorRequest", "ClassifyErrorResponse", classify_error
        )

    @app.post(f"{PREFIX}/diagnostic-summary")
    async def diagnostic(request: Request):
        return await structured(
            request, "DiagnosticSummaryRequest", "DiagnosticSummaryResponse", summarize_diagnostics
        )

    @app.post(f"{PREFIX}/knowledge-gap-draft")
    async def knowledge_gap(request: Request):
        return await structured(
            request, "KnowledgeGapDraftRequest", "KnowledgeGapDraftResponse", draft_knowledge_gap
        )

    @app.post(f"{PREFIX}/knowledge/search")
    async def search(request: Request):
        return await structured(
            request, "KnowledgeSearchRequest", "KnowledgeSearchResponse", search_knowledge
        )

    @app.get(f"{PREFIX}/knowledge/{{document_id}}")
    async def get_document(document_id: str, request: Request):
        accepted = time.monotonic()
        request_id = check_auth(request, settings)
        scope = read_scope_header(request, request_id)

        async def load_document():
            knowledge = await source.current()
            return knowledge.get(scope, document_id)

        document = await within_budget(
            load_document, accepted, settings.pipeline_timeout, request_id
        )
        if document is None:
            # Одинаково для «нет такого» и «нельзя»: факт существования не раскрываем.
            raise ApiError(404, "NOT_FOUND", "Документ не найден", request_id)
        content = {
            "id": document.id,
            "title": document.title,
            "content": document.content,
            "version": document.version,
            "synthetic": True,
        }
        check_response("KnowledgeDocumentResponse", content, request_id)
        return json_response(content, request_id)

    return app
