"""Платный /v1-адаптер без сети и денег: ответы API подменены через httpx.MockTransport."""

import asyncio
import json
import logging
import math

import httpx
import pytest
from ai_test_support import collect, events, generate_request, knowledge, make_settings
from app.api import make_embedder, make_provider
from app.budget import BudgetLedger, init_ledger
from app.generate import run_generate
from app.mock_provider import ProviderUnavailable
from app.openai_provider import OpenAIEmbedder, OpenAIProvider
from app.prompt import LlmInput
from app.vectors import EmbeddingError

PAID = {
    "llm_mode": "live",
    "llm_provider": "openai",
    "llm_base_url": "https://api.example/v1",
    "llm_model": "ai-sage/GigaChat3.5-432B-A28B",
    "llm_api_key": "secret-key",
    "llm_max_output_tokens": 1000,
    "embedding_model": "BAAI/bge-m3",
    "price_input_rub": 96.22,
    "price_output_rub": 288.60,
    "price_embedding_rub": 0.61,
}
USAGE = {"prompt_tokens": 6000, "completion_tokens": 700, "total_tokens": 6700}


def sse(*chunks) -> bytes:
    lines = []
    for chunk in chunks:
        data = chunk if isinstance(chunk, str) else json.dumps(chunk, ensure_ascii=False)
        lines.append(f"data: {data}\n\n")
    return "".join(lines).encode()


def delta(text: str, finish_reason=None) -> dict:
    return {"choices": [{"index": 0, "delta": {"content": text}, "finish_reason": finish_reason}]}


def usage_chunk(usage=USAGE) -> dict:
    return {"choices": [], "usage": usage}


def answer_with(*chunks, status: int = 200, seen: list | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(status, content=sse(*chunks))

    return handler


def refuse_connection(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("refused: secret details")


@pytest.fixture
def ledger(tmp_path) -> BudgetLedger:
    path = str(tmp_path / "budget.sqlite")
    init_ledger(path)
    return BudgetLedger(path, 800.0)


def provider_with(handler, ledger: BudgetLedger, **settings) -> OpenAIProvider:
    values = {**PAID, **settings}
    return OpenAIProvider(make_settings(**values), ledger, httpx.MockTransport(handler))


def read_stream(provider: OpenAIProvider) -> list[str]:
    llm_input = LlmInput([{"role": "user", "content": "привет"}], generate_request(), [])

    async def read_all():
        return [text async for text in provider.stream(llm_input, "normal")]

    return asyncio.run(read_all())


def test_request_has_model_cap_usage_and_key_header(ledger):
    seen = []
    handler = answer_with(delta("Ок"), usage_chunk(), "[DONE]", seen=seen)
    read_stream(provider_with(handler, ledger))
    request = seen[0]
    assert request.url.path == "/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer secret-key"
    body = json.loads(request.content)
    assert body["model"] == "ai-sage/GigaChat3.5-432B-A28B"
    assert body["stream"] is True
    assert body["max_tokens"] == 1000
    assert body["stream_options"] == {"include_usage": True}
    # По умолчанию лишних параметров нет: незнакомое поле API может отвергнуть.
    assert "reasoning_effort" not in body


def test_reasoning_effort_is_sent_when_configured(ledger):
    seen = []
    handler = answer_with(usage_chunk(), "[DONE]", seen=seen)
    read_stream(provider_with(handler, ledger, llm_reasoning_effort="none"))
    assert json.loads(seen[0].content)["reasoning_effort"] == "none"


def test_stream_yields_only_content_text(ledger):
    reasoning = {"choices": [{"index": 0, "delta": {"reasoning_content": "думаю..."}}]}
    chunks = [reasoning, delta("Под"), delta(""), delta("ключение"), usage_chunk(), "[DONE]"]
    texts = read_stream(provider_with(answer_with(*chunks), ledger))
    assert texts == ["Под", "ключение"]


def test_usage_replaces_reservation_with_actual_cost(ledger):
    read_stream(provider_with(answer_with(delta("Ок"), usage_chunk(), "[DONE]"), ledger))
    status = ledger.status()
    assert status["unsettled"] == 0
    assert math.isclose(status["spent_rub"], 0.77934)


def test_missing_usage_keeps_reservation(ledger):
    read_stream(provider_with(answer_with(delta("Ок"), "[DONE]"), ledger))
    status = ledger.status()
    assert status["unsettled"] == 1
    # Резерв — промпт по байтам + 1000 токенов ответа: больше любого реального вызова.
    assert status["spent_rub"] > 1000 * 288.60 / 1_000_000


def test_budget_stop_blocks_request_before_api_call(tmp_path):
    path = str(tmp_path / "budget.sqlite")
    init_ledger(path)
    seen = []
    provider = provider_with(answer_with(delta("Ок"), seen=seen), BudgetLedger(path, 0.01))
    with pytest.raises(ProviderUnavailable):
        read_stream(provider)
    assert seen == []


def test_broken_ledger_blocks_request(tmp_path):
    seen = []
    missing = BudgetLedger(str(tmp_path / "missing.sqlite"), 800.0)
    with pytest.raises(ProviderUnavailable):
        read_stream(provider_with(answer_with(delta("Ок"), seen=seen), missing))
    assert seen == []


def test_budget_stop_gives_run_failed_unavailable(tmp_path):
    path = str(tmp_path / "budget.sqlite")
    init_ledger(path)
    provider = provider_with(answer_with(delta("Ок")), BudgetLedger(path, 0.01))
    settings = make_settings(**PAID)
    items = collect(run_generate(generate_request(), provider, knowledge(), settings))
    failed = events(items)[-1]
    assert failed["event"] == "run.failed"
    assert failed["data"]["code"] == "LLM_UNAVAILABLE"
    assert all(item["event"] != "message.delta" for item in events(items))


@pytest.mark.parametrize(
    "handler",
    [
        answer_with(delta("Ок"), status=401),
        answer_with({"error": {"message": "secret details"}}),
        answer_with("not json"),
        refuse_connection,
    ],
    ids=["http-401", "error-in-stream", "not-json", "connect-refused"],
)
def test_provider_errors_become_unavailable_without_details(handler, ledger, caplog):
    with caplog.at_level(logging.DEBUG):
        with pytest.raises(ProviderUnavailable) as error:
            read_stream(provider_with(handler, ledger))
    assert "secret" not in str(error.value)
    assert "secret" not in caplog.text


def test_failed_call_is_not_free(ledger):
    # Запрос ушёл, usage не пришёл — резерв остаётся потраченным.
    with pytest.raises(ProviderUnavailable):
        read_stream(provider_with(refuse_connection, ledger))
    assert ledger.status()["unsettled"] == 1


def test_warns_when_answer_cut_by_output_limit(ledger, caplog):
    chunks = [delta("длинный", finish_reason="length"), usage_chunk(), "[DONE]"]
    with caplog.at_level(logging.WARNING, logger="app.openai_provider"):
        read_stream(provider_with(answer_with(*chunks), ledger))
    assert "LLM_MAX_OUTPUT_TOKENS" in caplog.text


def test_usage_log_has_numbers_not_key(ledger, caplog):
    with caplog.at_level(logging.INFO, logger="app.openai_provider"):
        read_stream(provider_with(answer_with(delta("Ок"), usage_chunk(), "[DONE]"), ledger))
    assert "6000" in caplog.text
    assert "secret-key" not in caplog.text


def test_warm_up_makes_no_paid_calls(ledger):
    seen = []
    provider = provider_with(answer_with(delta("Ок"), seen=seen), ledger)
    asyncio.run(provider.warm_up())
    assert seen == []
    assert ledger.status()["calls"] == 0


def test_aclose_closes_http_client(ledger):
    provider = provider_with(answer_with(), ledger)
    asyncio.run(provider.aclose())
    assert provider.client.is_closed
    assert provider.client.trust_env is False


# --- Эмбеддинги ---


def vector(value: float) -> list[float]:
    return [value] * 1024


def embeddings_reply(*items, usage: dict | None = None, status: int = 200, seen=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        payload = {"data": list(items)}
        if usage is not None:
            payload["usage"] = usage
        return httpx.Response(status, json=payload)

    return handler


def embedder_with(handler, ledger: BudgetLedger) -> OpenAIEmbedder:
    return OpenAIEmbedder(make_settings(**PAID), ledger, httpx.MockTransport(handler))


def embed(embedder: OpenAIEmbedder, texts: list[str]) -> list[list[float]]:
    return asyncio.run(embedder.embed(texts))


def test_embeddings_in_input_order_and_settled(ledger):
    seen = []
    handler = embeddings_reply(
        {"index": 1, "embedding": vector(0.2)},
        {"index": 0, "embedding": vector(0.1)},
        usage={"prompt_tokens": 1000, "total_tokens": 1000},
        seen=seen,
    )
    vectors = embed(embedder_with(handler, ledger), ["первый", "второй"])
    assert [row[0] for row in vectors] == [0.1, 0.2]
    body = json.loads(seen[0].content)
    assert body == {"model": "BAAI/bge-m3", "input": ["первый", "второй"]}
    assert seen[0].url.path == "/v1/embeddings"
    status = ledger.status()
    assert status["unsettled"] == 0
    assert math.isclose(status["spent_rub"], 1000 * 0.61 / 1_000_000)


def test_embeddings_without_usage_keep_reservation(ledger):
    embed(embedder_with(embeddings_reply({"index": 0, "embedding": vector(0.1)}), ledger), ["a"])
    assert ledger.status()["unsettled"] == 1


def test_embedding_budget_stop_blocks_call(tmp_path):
    path = str(tmp_path / "budget.sqlite")
    init_ledger(path)
    seen = []
    handler = embeddings_reply({"index": 0, "embedding": vector(0.1)}, seen=seen)
    with pytest.raises(EmbeddingError):
        embed(embedder_with(handler, BudgetLedger(path, 0.0000001)), ["текст"])
    assert seen == []


@pytest.mark.parametrize(
    "handler",
    [
        embeddings_reply(status=500),
        embeddings_reply({"index": 0, "embedding": [0.1] * 768}),
        embeddings_reply(),
        lambda request: httpx.Response(200, json={"no": "data"}),
        lambda request: httpx.Response(200, content=b"not json"),
        refuse_connection,
    ],
    ids=["http-500", "wrong-dim", "wrong-count", "no-data", "not-json", "connect-refused"],
)
def test_embedding_errors(handler, ledger):
    with pytest.raises(EmbeddingError) as error:
        embed(embedder_with(handler, ledger), ["текст"])
    assert "secret" not in str(error.value)


def test_embedder_warm_up_and_close(ledger):
    seen = []
    embedder = embedder_with(embeddings_reply(seen=seen), ledger)
    asyncio.run(embedder.warm_up())
    asyncio.run(embedder.aclose())
    assert seen == []
    assert embedder.client.is_closed


def test_factories_pick_paid_api_by_provider(tmp_path):
    settings = make_settings(**PAID, budget_ledger_path=str(tmp_path / "b.sqlite"))
    assert isinstance(make_provider(settings), OpenAIProvider)
    assert isinstance(make_embedder(settings), OpenAIEmbedder)
