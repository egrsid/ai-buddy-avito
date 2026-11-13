"""Failure recovery, chat notices, budget isolation and cancellation without paid calls."""

import asyncio
from dataclasses import replace

import httpx
import pytest
from ai_test_support import collect, events, generate_request, knowledge, make_settings
from app.api import create_app, make_provider
from app.config import ConfigError, load_settings
from app.contracts import is_valid
from app.failover import NOTICE, FailoverProvider
from app.generate import run_generate
from app.mock_provider import BudgetDenied, ProviderUnavailable
from fastapi.testclient import TestClient


class Scripted:
    def __init__(self, chunks=(), error=None, hang=False):
        self.chunks, self.error, self.hang = chunks, error, hang
        self.calls = 0
        self.closed = False

    async def stream(self, llm_input, scenario):
        self.calls += 1
        try:
            for chunk in self.chunks:
                yield chunk
            if self.hang:
                await asyncio.Event().wait()
            if self.error:
                raise self.error
        finally:
            self.closed = True

    async def warm_up(self):
        pass

    async def aclose(self):
        self.closed = True


def run(primary, secondary, **overrides):
    settings = make_settings(**overrides)
    provider = FailoverProvider(settings, (primary, secondary))
    return events(collect(run_generate(generate_request(), provider, knowledge(), settings)))


def text(items):
    return "".join(i["data"]["text"] for i in items if i["event"] == "message.delta")


def test_primary_success_does_not_call_secondary_or_announce_failure():
    a, b = Scripted(["Ответ основной модели"]), Scripted(["другой ответ"])
    items = run(a, b)
    assert text(items) == "Ответ основной модели"
    assert (a.calls, b.calls) == (1, 0)
    assert items[-1]["event"] == "generation.completed"
    assert a.closed


@pytest.mark.parametrize(
    "primary", [Scripted(error=ProviderUnavailable()), Scripted(hang=True), Scripted()]
)
def test_precontent_failure_uses_secondary_and_persists_notice_in_delta(primary):
    secondary = Scripted(["Резервный ответ"])
    items = run(primary, secondary)
    assert NOTICE in text(items) and "Резервный ответ" in text(items)
    assert "наставнику напрямую" in text(items)
    assert (primary.calls, secondary.calls) == (1, 1)
    assert items[-1]["event"] == "generation.completed"
    assert not any(i["event"] == "tool.proposed" for i in items)
    assert primary.closed


def test_both_models_fail_use_existing_offline_context_without_raw_error():
    a = Scripted(error=ProviderUnavailable("secret provider payload"))
    b = Scripted(error=ProviderUnavailable("token=secret"))
    items = run(a, b)
    output = text(items)
    assert NOTICE in output and "без LLM" in output
    assert "secret" not in output and "token=" not in output
    assert items[-1]["event"] == "generation.completed"
    assert not any(i["event"] == "tool.proposed" for i in items)
    for i in items:
        if i["event"] == "message.delta":
            assert is_valid("MessageDeltaEvent", i["data"])


def test_empty_frames_do_not_extend_attempt_and_oversized_text_leaves_room_for_notice():
    primary = Scripted([""] * 5, error=ProviderUnavailable())
    secondary = Scripted(["x" * 5000])
    items = run(primary, secondary)
    assert NOTICE in text(items) and "без LLM" in text(items)
    assert len(text(items)) < 4000


def test_two_attempt_timeouts_leave_budget_for_local_notice():
    items = run(Scripted(hang=True), Scripted(hang=True), pipeline_timeout=0.5)
    assert NOTICE in text(items)
    assert items[-1]["event"] == "generation.completed"


@pytest.mark.parametrize("error,hang", [(ProviderUnavailable(), False), (None, True)])
def test_failed_partial_is_discarded_before_trying_secondary(error, hang):
    a, b = Scripted(["Частичный ответ"], error=error, hang=hang), Scripted(["Второй LLM"])
    items = run(a, b)
    assert "Частичный ответ" not in text(items)
    assert NOTICE in text(items) and "Второй LLM" in text(items)
    assert b.calls == 1 and a.closed
    assert items[-1]["event"] == "generation.completed"


def test_budget_refusal_skips_all_further_paid_calls():
    a, b = Scripted(error=BudgetDenied()), Scripted(["платный ответ"])
    assert "без LLM" in text(run(a, b))
    assert b.calls == 0


def test_cancel_during_wait_closes_request_without_fallback():
    async def cancel():
        a, b = Scripted(hang=True), Scripted(["ответ"])
        provider = FailoverProvider(make_settings(), (a, b))
        from app.prompt import LlmInput

        stream = provider.stream(LlmInput([], generate_request(), []), "normal")
        task = asyncio.create_task(anext(stream))
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        await stream.aclose()
        assert a.closed and b.calls == 0

    asyncio.run(cancel())


def test_sessions_do_not_share_fallback_state():
    provider = FailoverProvider(make_settings(), (Scripted(), Scripted()))
    from app.prompt import LlmInput

    inp = LlmInput([], generate_request(), [])
    a, b = provider.stream(inp, "normal"), provider.stream(inp, "normal")
    a.degraded = True
    assert not b.degraded


PAID_ENV = {
    "INTERNAL_API_TOKEN": "test",
    "LLM_MODE": "live",
    "LLM_PROVIDER": "openai",
    "LLM_BASE_URL": "https://api.example/v1",
    "LLM_MODEL": "GigaChat/GigaChat-3-Pro",
    "LLM_FALLBACK_MODEL": "ai-sage/GigaChat3.5-432B-A28B",
    "LLM_API_KEY": "fake-key",
    "LLM_BUDGET_LEDGER_PATH": "/tmp/not-used.sqlite",
    "LLM_PRICE_INPUT_RUB": "100",
    "LLM_PRICE_OUTPUT_RUB": "300",
    "LLM_FALLBACK_PRICE_INPUT_RUB": "101",
    "LLM_FALLBACK_PRICE_OUTPUT_RUB": "301",
    "EMBEDDING_PRICE_RUB": "1",
}


@pytest.mark.parametrize(
    "changes",
    [
        {"LLM_FALLBACK_MODEL": PAID_ENV["LLM_MODEL"]},
        {"LLM_FALLBACK_PRICE_INPUT_RUB": ""},
        {"LLM_FALLBACK_PRICE_OUTPUT_RUB": "nan"},
    ],
)
def test_failover_rejects_duplicate_models_or_unknown_tariff(changes):
    with pytest.raises(ConfigError):
        load_settings({**PAID_ENV, **changes})


def test_real_adapter_order_shared_ledger_and_model_specific_prices(tmp_path):
    settings = load_settings({**PAID_ENV, "LLM_BUDGET_LEDGER_PATH": str(tmp_path / "b.sqlite")})
    provider = make_provider(settings)
    a, b = provider.providers
    assert a.ledger is b.ledger
    assert [p.settings.llm_model for p in provider.providers] == [
        "GigaChat/GigaChat-3-Pro",
        "ai-sage/GigaChat3.5-432B-A28B",
    ]
    assert b.settings.price_input_rub == 101
    assert b.settings.price_output_rub == 301
    seen = []

    def fail(request):
        seen.append(request)
        return httpx.Response(503)

    for p in provider.providers:
        asyncio.run(p.client.aclose())
        p.client = httpx.AsyncClient(
            base_url=settings.llm_base_url, transport=httpx.MockTransport(fail)
        )
    items = collect(run_generate(generate_request(), provider, knowledge(), make_settings()))
    assert "без LLM" in text(events(items)) and len(seen) == 2
    # Unknown usage leaves both independent reservations charged, even after fallback.
    import sqlite3

    with sqlite3.connect(settings.budget_ledger_path) as db:
        assert (
            db.execute("SELECT count(*) FROM reservations WHERE actual_rub IS NULL").fetchone()[0]
            == 2
        )
    asyncio.run(provider.warm_up())
    asyncio.run(provider.aclose())


def test_http_sse_notice_has_no_new_wire_fields():
    settings = replace(make_settings(), llm_mode="mock")
    provider = FailoverProvider(settings, (Scripted(error=ProviderUnavailable()), Scripted()))
    app = create_app(settings, provider=provider, knowledge=knowledge())
    with TestClient(app) as client:
        response = client.post(
            "/internal/v2/generate",
            json=generate_request(),
            headers={
                "Authorization": f"Bearer {settings.internal_api_token}",
                "X-Request-ID": generate_request()["run_id"],
            },
        )
    assert response.status_code == 200
    assert NOTICE in response.text and "generation.completed" in response.text
