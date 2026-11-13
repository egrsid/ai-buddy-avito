"""Пайплайн generate без HTTP: порядок событий, таймеры, ping, отмена."""

import asyncio

from ai_test_support import (
    collect,
    events,
    generate_request,
    intern_a_scope,
    knowledge,
    make_settings,
)
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


# --- общий дедлайн 85 с перед финальными событиями (ревью TL, AI-R3) ---------------


class FakeClock:
    """Часы теста: время меняет только сам тест или его fake-объекты."""

    def __init__(self):
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class LateEofProvider:
    """Отдаёт текст, а к концу потока (EOF) часы уже за дедлайном."""

    def __init__(self, clock, eof_at: float):
        self.clock = clock
        self.eof_at = eof_at
        self.closed = False

    async def stream(self, request, scenario):
        try:
            yield "ok"
            self.clock.now = self.eof_at
        finally:
            self.closed = True


class SlowKnowledge:
    """Знания, на которых время «уходит» при сборке источников (после первой проверки)."""

    def __init__(self, clock, jump_to: float):
        self.base = knowledge()
        self.vectors = self.base.vectors
        self.clock = clock
        self.jump_to = jump_to

    def search(self, *args):
        return self.base.search(*args)

    def get(self, scope, document_id):
        self.clock.now = self.jump_to
        return self.base.get(scope, document_id)


def run_with_clock(request, provider, knowledge_source, clock, **settings):
    values = {"pipeline_timeout": 85.0, "first_token_timeout": 20.0, "stream_idle_timeout": 25.0}
    values.update(settings)
    stream = run_generate(
        request, provider, knowledge_source, make_settings(**values), "normal", clock=clock
    )
    return collect(stream)


def test_eof_after_deadline_fails_without_late_events():
    clock = FakeClock()
    provider = LateEofProvider(clock, eof_at=86.0)
    items = run_with_clock(generate_request(), provider, knowledge(), clock)
    assert names(items) == ["run.started", "message.delta", "run.failed"]
    assert events(items)[-1]["data"]["code"] == "LLM_TIMEOUT"
    assert provider.closed


def test_eof_just_before_deadline_completes():
    clock = FakeClock()
    items = run_with_clock(generate_request(), LateEofProvider(clock, 84.9), knowledge(), clock)
    assert names(items)[-1] == "generation.completed"


def test_deadline_passed_while_sending_sources_blocks_completed():
    clock = FakeClock()
    slow = SlowKnowledge(clock, jump_to=86.0)
    items = run_with_clock(generate_request(), MockProvider(0.0), slow, clock)
    order = names(items)
    assert order[-2:] == ["message.sources", "run.failed"]
    assert "generation.completed" not in order
    assert order.count("run.failed") == 1


def test_deadline_passed_before_tool_blocks_tool_and_completed():
    request = generate_request()
    request["access_scope"] = intern_a_scope()
    request["allowed_tools"] = ["create_access_request"]
    request["goal_context"]["current_step_id"] = "check_access"
    request["goal_context"]["next_actions"] = ["create_access_request"]
    request["action_results"] = []
    clock = FakeClock()
    items = run_with_clock(request, MockProvider(0.0), SlowKnowledge(clock, 86.0), clock)
    order = names(items)
    assert order[-2:] == ["message.sources", "run.failed"]
    assert "tool.proposed" not in order
    assert "generation.completed" not in order


def test_pipeline_counts_from_request_acceptance():
    """Время до потока (чтение запроса, индекс) тоже из бюджета: старт уже за дедлайном."""
    clock = FakeClock()
    clock.now = 100.0
    provider = ScriptedProvider([(0, "ответ")])
    stream = run_generate(
        generate_request(),
        provider,
        knowledge(),
        make_settings(pipeline_timeout=85.0),
        "normal",
        clock=clock,
        accepted=10.0,
    )
    items = collect(stream)
    assert names(items) == ["run.started", "run.failed"]
    assert events(items)[-1]["data"]["code"] == "LLM_TIMEOUT"


def test_query_embeddings_off_skips_question_vector():
    from ai_test_support import FakeEmbedder
    from test_hybrid_search import HYBRID

    for enabled, expected_calls in [(True, 1), (False, 0)]:
        embedder = FakeEmbedder()
        settings = make_settings(query_embeddings=enabled)
        stream = run_generate(
            generate_request(), MockProvider(0.0), HYBRID, settings, "normal", embedder=embedder
        )
        items = collect(stream)
        assert events(items)[-1]["event"] == "generation.completed"
        assert len(embedder.calls) == expected_calls
