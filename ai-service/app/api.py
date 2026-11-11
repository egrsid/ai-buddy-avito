"""HTTP-приложение AI-сервиса: маршруты без бизнес-логики, она в отдельных модулях."""

from collections.abc import Callable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app import operations
from app.config import Settings
from app.drafts import access_request_draft
from app.errors import ApiError, error_response
from app.generate import run_generate
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

PREFIX = "/internal/v2"


def json_response(content: dict, request_id: str) -> JSONResponse:
    return JSONResponse(content=content, headers={"X-Request-ID": request_id})


def create_app(settings: Settings, provider=None, knowledge: KnowledgeBase | None = None):
    if provider is None:
        provider = MockProvider(slow_stream_delay=settings.slow_stream_delay)
    if knowledge is None:
        knowledge = KnowledgeBase(load_corpus())

    app = FastAPI(title="AI-buddy internal AI", docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, error: ApiError):
        return error_response(error)

    @app.get("/healthz")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "ai-service"}

    @app.post(f"{PREFIX}/generate")
    async def generate(request: Request):
        # Все проверки — до первого байта потока: потом статус уже не изменить.
        request_id, body = await read_internal_request(request, settings, "GenerateRequest")
        scenario = mock_scenario(request, settings, request_id)
        return StreamingResponse(
            run_generate(body, provider, knowledge, settings, scenario),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "X-Request-ID": request_id,
            },
        )

    async def structured(request: Request, definition: str, handler: Callable[[dict], dict]):
        """Общий путь непотоковой операции: проверки -> mock-сбой -> результат."""
        request_id, body = await read_internal_request(request, settings, definition)
        raise_for_scenario(mock_scenario(request, settings, request_id), request_id)
        return json_response(handler(body), request_id)

    @app.post(f"{PREFIX}/journey-selection")
    async def journey_selection(request: Request):
        return await structured(request, "JourneySelectionRequest", operations.select_journey)

    @app.post(f"{PREFIX}/access-request-draft")
    async def draft(request: Request):
        return await structured(request, "AccessRequestDraftRequest", access_request_draft)

    @app.post(f"{PREFIX}/classify-error")
    async def classify(request: Request):
        return await structured(request, "ClassifyErrorRequest", operations.classify_error)

    @app.post(f"{PREFIX}/diagnostic-summary")
    async def diagnostic(request: Request):
        def handler(body: dict) -> dict:
            return operations.diagnostic_summary(body, knowledge)

        return await structured(request, "DiagnosticSummaryRequest", handler)

    @app.post(f"{PREFIX}/knowledge-gap-draft")
    async def knowledge_gap(request: Request):
        request_id, body = await read_internal_request(
            request, settings, "KnowledgeGapDraftRequest"
        )
        raise_for_scenario(mock_scenario(request, settings, request_id), request_id)
        result = operations.knowledge_gap_draft(body, knowledge)
        if result is None:
            raise ApiError(404, "NOT_FOUND", "Нет доступных инструкций", request_id)
        return json_response(result, request_id)

    @app.post(f"{PREFIX}/knowledge/search")
    async def search(request: Request):
        def handler(body: dict) -> dict:
            hits = knowledge.search(body["access_scope"], body["query"], body.get("top_k", 5))
            return {"sources": [source_for(hit.document, hit.chunk) for hit in hits]}

        return await structured(request, "KnowledgeSearchRequest", handler)

    @app.get(f"{PREFIX}/knowledge/{{document_id}}")
    async def get_document(document_id: str, request: Request):
        request_id = check_auth(request, settings)
        scope = read_scope_header(request, request_id)
        document = knowledge.get(scope, document_id)
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
        return json_response(content, request_id)

    return app
