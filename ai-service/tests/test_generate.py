"""Пайплайн generate без HTTP: порядок событий, таймеры, ping, отмена."""

import asyncio

from ai_test_support import collect, events, generate_request, knowledge, make_settings
from app.contracts import is_valid
from app.generate import run_generate
from app.mock_provider import MockProvider

PAYLOADS = {
    "run.started": "RunStartedEvent",
    "message.delta": "MessageDeltaEvent",
    "message.sources": "MessageSourcesEvent",
    "tool.proposed": "ToolProposedEvent",
    "generation.completed": "GenerationCompletedEvent",
    "run.failed": "RunFailedEvent",
}


class ScriptedProvider:
    """Fake-провайдер: отдаёт куски по сценарию [(пауза, текст)], потом молчит или заканчивает."""

    def __init__(self, steps, hang_after=False):
        self.steps = steps
        self.hang_after = hang_after
        self.closed = False

    async def stream(self, request, scenario):
        try:
            for delay, text in self.steps:
                await asyncio.sleep(delay)
                yield text
            if self.hang_after:
                await asyncio.Event().wait()
        finally:
            self.closed = True


def run(provider, scenario="normal", **settings):
    return collect(
        run_generate(generate_request(), provider, knowledge(), make_settings(**settings), scenario)
    )


def names(items):
    return [item["event"] for item in events(items)]


def test_normal_stream_order_ids_and_schema():
    items = run(MockProvider(0.0))
    order = names(items)
    assert order[0] == "run.started"
    assert order[-2:] == ["message.sources", "generation.completed"]
    assert set(order[1:-2]) == {"message.delta"}
    assert [item["id"] for item in events(items)] == list(range(1, len(order) + 1))
    for item in events(items):
        assert is_valid(PAYLOADS[item["event"]], item["data"]), item
        assert item["data"]["run_id"] == generate_request()["run_id"]


def test_unavailable_ends_with_run_failed():
    items = run(MockProvider(0.0), "unavailable")
    assert names(items) == ["run.started", "run.failed"]
    assert events(items)[-1]["data"]["code"] == "LLM_UNAVAILABLE"


def test_first_token_timeout_sends_pings_then_fails():
    provider = ScriptedProvider([], hang_after=True)
    items = run(provider, first_token_timeout=0.2, ping_interval=0.05)
    assert names(items) == ["run.started", "run.failed"]
    assert events(items)[-1]["data"]["code"] == "LLM_TIMEOUT"
    assert is_valid("RunFailedEvent", events(items)[-1]["data"])
    assert {"ping": True} in items
    assert provider.closed


def test_mock_timeout_scenario():
    items = run(MockProvider(0.0), "timeout", first_token_timeout=0.1)
    assert events(items)[-1]["data"]["code"] == "LLM_TIMEOUT"


def test_idle_timeout_after_first_chunk():
    provider = ScriptedProvider([(0, "привет")], hang_after=True)
    items = run(provider, stream_idle_timeout=0.1)
    assert names(items) == ["run.started", "message.delta", "run.failed"]
    assert events(items)[-1]["data"]["code"] == "LLM_TIMEOUT"


def test_pipeline_timeout_even_if_chunks_keep_coming():
    provider = ScriptedProvider([(0.03, "ещё")] * 100)
    items = run(provider, pipeline_timeout=0.15)
    assert names(items)[-1] == "run.failed"
    assert "message.delta" in names(items)


def test_slow_first_chunk_within_limit_is_fine():
    provider = ScriptedProvider([(0.12, "ответ")])
    items = run(provider, first_token_timeout=0.3, ping_interval=0.05)
    assert names(items) == [
        "run.started",
        "message.delta",
        "message.sources",
        "generation.completed",
    ]
    # Ping шёл, пока ждали первый кусок, и таймер не сбросил.
    assert {"ping": True} in items


def test_empty_chunks_are_not_deltas():
    provider = ScriptedProvider([(0, ""), (0, "текст")])
    items = run(provider)
    deltas = [item for item in events(items) if item["event"] == "message.delta"]
    assert [delta["data"]["text"] for delta in deltas] == ["текст"]


def test_empty_chunk_does_not_reset_first_token_timer():
    provider = ScriptedProvider([(0.06, "")] * 10)
    items = run(provider, first_token_timeout=0.2)
    assert events(items)[-1]["data"]["code"] == "LLM_TIMEOUT"


def test_invalid_tool_is_proposed_but_breaks_schema():
    items = run(MockProvider(0.0), "invalid_tool")
    order = names(items)
    assert order[-3:] == ["message.sources", "tool.proposed", "generation.completed"]
    assert order.count("tool.proposed") == 1
    tool = events(items)[-2]["data"]
    assert not is_valid("ToolProposedEvent", tool)


def test_invalid_tool_without_goal_context():
    request = generate_request()
    del request["goal_context"]
    items = collect(
        run_generate(request, MockProvider(0.0), knowledge(), make_settings(), "invalid_tool")
    )
    tool = events(items)[-2]["data"]
    assert tool["goal_id"] == request["run_id"]


def test_disconnect_while_waiting_cancels_provider():
    provider = ScriptedProvider([], hang_after=True)

    async def read_until_ping():
        stream = run_generate(generate_request(), provider, knowledge(), make_settings(), "normal")
        async for part in stream:
            if part.startswith(": ping"):
                break
        # Так Starlette закрывает поток, когда Go оборвал соединение.
        await stream.aclose()

    asyncio.run(read_until_ping())
    assert provider.closed
