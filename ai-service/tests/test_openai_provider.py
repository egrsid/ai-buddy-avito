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
from app.openai_provider import (
    CONNECT_ATTEMPTS,
    CONNECT_TIMEOUT,
    KEEP_WARM_SECONDS,
    KEEPALIVE_SECONDS,
    OpenAIEmbedder,
    OpenAIProvider,
    keep_warm,
)
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


def test_per_call_output_limit_is_sent_and_reserved(ledger):
    # Лимит операции (правка ТЗ) уходит в API и в резерв журнала: обойти бюджет им нельзя.
    seen = []
    provider = provider_with(
        answer_with(delta("Ок"), "[DONE]", seen=seen), ledger, llm_max_output_tokens=400
    )
    messages = [{"role": "user", "content": "привет"}]
    llm_input = LlmInput(messages, generate_request(), [], max_output_tokens=1000)

    async def read_all():
        return [text async for text in provider.stream(llm_input, "normal")]

    asyncio.run(read_all())
    assert json.loads(seen[0].content)["max_tokens"] == 1000
    assert ledger.status()["spent_rub"] == pytest.approx(provider.upper_cost(messages, 1000))
    assert provider.upper_cost(messages, 1000) > provider.upper_cost(messages)


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


def test_cumulative_usage_in_every_chunk_settles_once_by_last(ledger):
    # Так шлёт Cloud.ru: usage растёт с каждым куском, первый — с нулевым выходом.
    chunks = [
        {**delta("Под"), "usage": {"prompt_tokens": 6000, "completion_tokens": 0}},
        {**delta("ключение"), "usage": {"prompt_tokens": 6000, "completion_tokens": 350}},
        usage_chunk(),
        "[DONE]",
    ]
    texts = read_stream(provider_with(answer_with(*chunks), ledger))
    assert texts == ["Под", "ключение"]
    status = ledger.status()
    assert status["unsettled"] == 0
    assert math.isclose(status["spent_rub"], 0.77934)


def test_cancelled_stream_keeps_reservation_despite_usage_seen(ledger):
    chunks = [
        {**delta("Под"), "usage": {"prompt_tokens": 6000, "completion_tokens": 1}},
        delta("ключение"),
        usage_chunk(),
        "[DONE]",
    ]
    provider = provider_with(answer_with(*chunks), ledger)
    llm_input = LlmInput([{"role": "user", "content": "привет"}], generate_request(), [])

    async def read_first_and_cancel():
        stream = provider.stream(llm_input, "normal")
        first = await anext(stream)
        await stream.aclose()
        return first

    assert asyncio.run(read_first_and_cancel()) == "Под"
    assert ledger.status()["unsettled"] == 1


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


def test_warm_up_only_keeps_the_connection_and_aclose_stops_it(ledger):
    seen = []
    provider = provider_with(answer_with(delta("Ок"), seen=seen), ledger)

    async def lifecycle():
        await provider.warm_up()
        for _ in range(20):
            await asyncio.sleep(0)
        task = provider.warm_task
        await provider.aclose()
        return task

    task = asyncio.run(lifecycle())
    assert task.done() and provider.warm_task is None
    # Только бесплатный список моделей: ни запроса к модели, ни записи в журнале расходов.
    assert seen and all((r.method, r.url.path) == ("GET", "/v1/models") for r in seen)
    assert ledger.status()["calls"] == 0


def test_keep_warm_survives_network_errors_and_waits_between_pings(caplog):
    calls, pauses = [], []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            raise httpx.ConnectTimeout("secret details")
        return httpx.Response(200, json={"data": []})

    async def sleep(seconds):
        pauses.append(seconds)
        if len(pauses) == 3:
            raise asyncio.CancelledError

    async def run_pings():
        async with httpx.AsyncClient(
            base_url="https://api.example/v1", transport=httpx.MockTransport(handler)
        ) as client:
            with pytest.raises(asyncio.CancelledError):
                await keep_warm(client, interval=7.0, sleep=sleep)

    with caplog.at_level(logging.INFO):
        asyncio.run(run_pings())
    assert len(calls) == 3 and pauses == [7.0, 7.0, 7.0]
    assert "ConnectTimeout" in caplog.text and "secret" not in caplog.text


def test_connection_timings_fit_lossy_networks():
    # ОС повторяет потерянный пакет подключения через 1 и 3 с; 6 с — лимит failover.
    assert 3.0 < CONNECT_TIMEOUT < 6.0
    # Пинг приходит раньше, чем клиент сам закроет простаивающее соединение.
    assert KEEP_WARM_SECONDS < KEEPALIVE_SECONDS


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
    transport = httpx.MockTransport(handler)
    return OpenAIEmbedder(make_settings(**PAID), ledger, transport, retry_delays=(0, 0))


def replies_in_turn(*handlers):
    """Каждый следующий запрос получает ответ следующего handler."""
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return handlers[min(len(calls), len(handlers)) - 1](request)

    return handler, calls


OK_REPLY = embeddings_reply(
    {"index": 0, "embedding": vector(0.1)}, usage={"prompt_tokens": 10, "total_tokens": 10}
)


def test_embeddings_retry_temporary_server_errors(ledger):
    handler, calls = replies_in_turn(embeddings_reply(status=503), refuse_connection, OK_REPLY)
    vectors = embed(embedder_with(handler, ledger), ["текст"])
    assert len(vectors) == 1
    assert len(calls) == 3
    assert ledger.status()["unsettled"] == 0


def test_embeddings_give_up_after_three_attempts(ledger):
    handler, calls = replies_in_turn(embeddings_reply(status=500))
    with pytest.raises(EmbeddingError):
        embed(embedder_with(handler, ledger), ["текст"])
    assert len(calls) == 3
    assert ledger.status()["unsettled"] == 1


def test_embeddings_do_not_retry_client_errors(ledger):
    handler, calls = replies_in_turn(embeddings_reply(status=401), OK_REPLY)
    with pytest.raises(EmbeddingError):
        embed(embedder_with(handler, ledger), ["текст"])
    assert len(calls) == 1


def test_embedder_default_retry_delays_fit_first_token_limit(ledger):
    embedder = OpenAIEmbedder(make_settings(**PAID), ledger, httpx.MockTransport(OK_REPLY))
    assert sum(embedder.retry_delays) < 5


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

    async def lifecycle():
        await embedder.warm_up()
        for _ in range(20):
            await asyncio.sleep(0)
        await embedder.aclose()

    asyncio.run(lifecycle())
    assert all(r.method == "GET" and r.url.path.endswith("/models") for r in seen)
    assert embedder.client.is_closed and embedder.warm_task is None
    assert ledger.status()["calls"] == 0


def test_factories_pick_paid_api_by_provider(tmp_path):
    settings = make_settings(**PAID, budget_ledger_path=str(tmp_path / "b.sqlite"))
    from app.failover import FailoverProvider

    provider = make_provider(settings)
    assert isinstance(provider, FailoverProvider)
    assert len(provider.providers) == 1 and isinstance(provider.providers[0], OpenAIProvider)
    assert isinstance(make_embedder(settings), OpenAIEmbedder)


def test_factory_creates_ledger_on_first_start(tmp_path):
    path = tmp_path / "volume" / "budget.sqlite"
    make_provider(make_settings(**PAID, budget_ledger_path=str(path)))
    assert path.exists()


def test_eof_without_done_is_not_success_and_keeps_unknown_usage_reserved(ledger):
    provider = provider_with(answer_with(delta("Оборванный ответ")), ledger)
    with pytest.raises(ProviderUnavailable):
        read_stream(provider)
    assert ledger.status()["unsettled"] == 1


@pytest.mark.parametrize("reason", ["stop", "length"])
def test_eof_after_finish_reason_is_a_complete_answer_and_settles(ledger, reason):
    chunks = [delta("Полный"), delta(" ответ", finish_reason=reason), usage_chunk()]
    provider = provider_with(answer_with(*chunks), ledger)
    assert "".join(read_stream(provider)) == "Полный ответ"
    assert ledger.status()["unsettled"] == 0


@pytest.mark.parametrize(
    "usage",
    [
        {"prompt_tokens": 10},
        {"prompt_tokens": -1, "completion_tokens": 2},
        {"prompt_tokens": True, "completion_tokens": 2},
        {"prompt_tokens": "10", "completion_tokens": 2},
    ],
)
def test_invalid_usage_keeps_the_reservation_instead_of_refunding(ledger, usage):
    provider = provider_with(answer_with(delta("Ответ"), usage_chunk(usage), "[DONE]"), ledger)
    assert read_stream(provider) == ["Ответ"]
    assert ledger.status()["unsettled"] == 1
    row = ledger.observations()[0]
    assert row["actual_rub"] is None and row["reserved_rub"] > 0
    assert row["model"] == PAID["llm_model"]
    assert row["correlation_id"] is not None


def test_connect_failure_is_retried_once_then_reported(ledger):
    calls = []

    def flaky(request):
        calls.append(request)
        if len(calls) == 1:
            raise httpx.ConnectTimeout("no route")
        return httpx.Response(200, content=sse(delta("Ок"), usage_chunk(), "[DONE]"))

    assert read_stream(provider_with(flaky, ledger)) == ["Ок"]
    assert len(calls) == 2 and ledger.status()["unsettled"] == 0

    def down(request):
        calls.append(request)
        raise httpx.ConnectError("refused")

    calls.clear()
    with pytest.raises(ProviderUnavailable, match="ConnectError"):
        read_stream(provider_with(down, ledger))
    assert len(calls) == CONNECT_ATTEMPTS


def test_read_failure_after_connect_is_not_retried(ledger):
    calls = []

    def broken(request):
        calls.append(request)
        raise httpx.ReadTimeout("slow")

    with pytest.raises(ProviderUnavailable, match="ReadTimeout"):
        read_stream(provider_with(broken, ledger))
    assert len(calls) == 1
