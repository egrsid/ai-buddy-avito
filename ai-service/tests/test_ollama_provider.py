"""Live-провайдер Ollama без сети: ответы Ollama подменены через httpx.MockTransport."""

import asyncio
import json
import logging

import httpx
import pytest
from ai_test_support import collect, events, generate_request, knowledge, make_settings
from app.generate import run_generate
from app.mock_provider import ProviderUnavailable
from app.ollama_provider import OllamaProvider
from app.prompt import SYSTEM_PROMPT, LlmInput

LIVE = {"llm_mode": "live", "llm_base_url": "http://ollama:11434", "llm_model": "qwen3.5:9b"}


def ndjson(*lines: dict) -> bytes:
    return "".join(json.dumps(line, ensure_ascii=False) + "\n" for line in lines).encode()


def done(**extra) -> dict:
    return {"done": True, "done_reason": "stop", "prompt_eval_count": 900, **extra}


def provider_with(handler, **settings) -> OllamaProvider:
    return OllamaProvider(make_settings(**LIVE, **settings), httpx.MockTransport(handler))


def answer_with(*lines: dict, status: int = 200, seen: list | None = None):
    """Fake Ollama: на любой запрос отвечает этими строками; запросы складывает в seen."""

    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(status, content=ndjson(*lines))

    return handler


def refuse_connection(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("refused: secret details")


def not_json(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, content=b"not json\n")


def read_stream(provider: OllamaProvider) -> list[str]:
    llm_input = LlmInput([{"role": "user", "content": "привет"}], generate_request(), [])

    async def read_all():
        return [text async for text in provider.stream(llm_input, "normal")]

    return asyncio.run(read_all())


def test_request_sets_context_window_and_disables_thinking():
    seen = []
    handler = answer_with(done(), seen=seen)
    read_stream(provider_with(handler, llm_num_ctx=8192, llm_max_output_tokens=300))
    request = seen[0]
    assert str(request.url) == "http://ollama:11434/api/chat"
    body = json.loads(request.content)
    assert body["model"] == "qwen3.5:9b"
    assert body["stream"] is True
    assert body["think"] is False
    assert body["keep_alive"] == "30m"
    assert body["options"] == {"num_ctx": 8192, "num_predict": 300}
    assert body["messages"] == [{"role": "user", "content": "привет"}]


def test_stream_yields_text_pieces_and_skips_empty():
    lines = [
        {"message": {"role": "assistant", "content": "Шаг "}, "done": False},
        {"message": {"role": "assistant", "content": ""}, "done": False},
        {"message": {"role": "assistant", "content": "заблокирован."}, "done": False},
        done(),
    ]
    assert read_stream(provider_with(answer_with(*lines))) == ["Шаг ", "заблокирован."]


@pytest.mark.parametrize(
    "handler",
    [
        answer_with({"error": "model not found"}, status=404),
        answer_with({"message": {"content": "нача"}}, {"error": "внутренний сбой"}),
        not_json,
        refuse_connection,
    ],
    ids=["http-404", "error-in-stream", "not-json", "connect-refused"],
)
def test_failures_become_provider_unavailable(handler):
    with pytest.raises(ProviderUnavailable):
        read_stream(provider_with(handler))


def test_unavailable_ollama_gives_safe_run_failed():
    provider = provider_with(refuse_connection)
    settings = make_settings(**LIVE)
    items = collect(run_generate(generate_request(), provider, knowledge(), settings))
    failed = events(items)[-1]
    assert failed["event"] == "run.failed"
    assert failed["data"]["code"] == "LLM_UNAVAILABLE"
    assert "secret" not in json.dumps(failed)


def test_warns_when_prompt_nearly_fills_context(caplog):
    with caplog.at_level(logging.WARNING, logger="app.ollama_provider"):
        read_stream(provider_with(answer_with(done(prompt_eval_count=16100))))
    assert "обрезать" in caplog.text


def test_warns_when_answer_cut_by_output_limit(caplog):
    lines = [{"message": {"content": "длинный"}}, done(done_reason="length")]
    with caplog.at_level(logging.WARNING, logger="app.ollama_provider"):
        read_stream(provider_with(answer_with(*lines)))
    assert "LLM_MAX_OUTPUT_TOKENS" in caplog.text


def test_normal_answer_logs_nothing(caplog):
    with caplog.at_level(logging.WARNING, logger="app.ollama_provider"):
        read_stream(provider_with(answer_with(done())))
    assert caplog.text == ""


def test_warm_up_loads_model_with_same_context_window():
    seen = []
    provider = provider_with(answer_with(done(), seen=seen), llm_num_ctx=16384)
    asyncio.run(provider.warm_up())
    body = json.loads(seen[0].content)
    assert body["messages"] == [{"role": "system", "content": SYSTEM_PROMPT}]
    # Тот же num_ctx, что у обычных запросов, иначе Ollama перезагрузит модель.
    assert body["options"] == {"num_ctx": 16384, "num_predict": 1}


def test_warm_up_does_not_warn_about_its_own_one_token_limit(caplog):
    lines = [{"message": {"content": "Ок"}}, done(done_reason="length")]
    with caplog.at_level(logging.INFO, logger="app.ollama_provider"):
        asyncio.run(provider_with(answer_with(*lines)).warm_up())
    assert "LLM_MAX_OUTPUT_TOKENS" not in caplog.text
    assert "прогрета" in caplog.text


def test_warm_up_failure_does_not_crash(caplog):
    with caplog.at_level(logging.WARNING, logger="app.ollama_provider"):
        asyncio.run(provider_with(refuse_connection).warm_up())
    assert "Прогрев не удался" in caplog.text


def test_client_ignores_system_proxy():
    # Системный прокси Windows/VPN перехватывал localhost и отвечал 502.
    assert provider_with(answer_with(done())).client.trust_env is False


def test_aclose_closes_http_client():
    provider = provider_with(answer_with(done()))
    asyncio.run(provider.aclose())
    assert provider.client.is_closed
