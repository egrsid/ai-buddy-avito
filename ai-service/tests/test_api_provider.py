"""Выбор провайдера по LLM_MODE и прогрев/закрытие провайдера при старте/остановке."""

from ai_test_support import make_settings
from app.api import create_app, make_provider
from app.mock_provider import MockProvider
from app.ollama_provider import OllamaProvider
from fastapi.testclient import TestClient


def test_mock_mode_uses_mock_provider():
    assert isinstance(make_provider(make_settings()), MockProvider)


def test_live_mode_uses_ollama_provider():
    settings = make_settings(
        llm_mode="live", llm_base_url="http://ollama:11434", llm_model="qwen3.5:9b"
    )
    provider = make_provider(settings)
    assert isinstance(provider, OllamaProvider)
    assert provider.settings.llm_num_ctx == 16384


class RecordingProvider(MockProvider):
    def __init__(self):
        super().__init__(0.0)
        self.calls = []

    async def warm_up(self):
        self.calls.append("warm_up")

    async def aclose(self):
        self.calls.append("aclose")


def test_lifespan_warms_up_and_closes_provider():
    provider = RecordingProvider()
    with TestClient(create_app(make_settings(), provider=provider)) as client:
        assert client.get("/healthz").status_code == 200
    assert provider.calls == ["warm_up", "aclose"]


def test_mock_provider_lifecycle_is_noop():
    with TestClient(create_app(make_settings())) as client:
        assert client.get("/healthz").status_code == 200
