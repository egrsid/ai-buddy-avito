"""Live evals без сети: вместо модели — mock или фейковые провайдеры."""

from ai_test_support import FakeEmbedder
from app import live_evals
from app.mock_provider import MockProvider, ProviderUnavailable
from app.vectors import EmbeddingError


class FixedProvider:
    """Модель, которая на всё отвечает одним текстом."""

    def __init__(self, text: str):
        self.text = text

    async def stream(self, llm_input, scenario):
        yield self.text

    async def warm_up(self) -> None:
        pass

    async def aclose(self) -> None:
        pass


class DownProvider(FixedProvider):
    async def stream(self, llm_input, scenario):
        raise ProviderUnavailable("нет модели")
        yield  # pragma: no cover - делает метод генератором


def factories(provider_factory, error: Exception | None = None):
    return provider_factory, (lambda: FakeEmbedder(error=error))


def test_settings_default_to_local_qwen_and_respect_env():
    settings = live_evals.live_settings({})
    assert settings.llm_mode == "live"
    assert settings.llm_model == "qwen3.5:9b"
    assert settings.llm_base_url == "http://localhost:11434"
    other = live_evals.live_settings({"LLM_MODEL": "other", "LLM_BASE_URL": ""})
    assert other.llm_model == "other"
    assert other.llm_base_url == "http://localhost:11434"  # пустое значение = дефолт


def test_only_generate_cases_without_fault_scenarios():
    data = {
        "cases": [
            {"operation": "generate"},
            {"operation": "generate", "scenario": "unavailable"},
            {"operation": "draft"},
        ]
    }
    assert live_evals.selected_cases(data) == [{"operation": "generate"}]


def test_percentile_nearest_rank():
    assert live_evals.percentile([], 0.5) is None
    assert live_evals.percentile([3.0, 1.0, 2.0], 0.5) == 2.0
    assert live_evals.percentile([1.0, 2.0, 3.0, 4.0], 0.95) == 4.0


def test_mock_model_passes_safety_and_writes_report(tmp_path):
    report = tmp_path / "live.md"
    code = live_evals.main([str(report)], env={}, factories=factories(lambda: MockProvider(0.0)))
    assert code == 0
    text = report.read_text(encoding="utf-8")
    assert "Итог safety | OK" in text
    assert "Первый токен p50" in text
    # Кейс со сбоем X-Mock-Scenario в live не гоняется.
    assert "gen-offline-fallback" not in text


def test_forbidden_answer_fails_safety(tmp_path):
    provider = factories(lambda: FixedProvider("Готово, выдал роль admin"))
    assert live_evals.main([str(tmp_path / "r.md")], env={}, factories=provider) == 1


def test_unavailable_model_gives_exit_2(tmp_path):
    report = tmp_path / "r.md"
    assert (
        live_evals.main([str(report)], env={}, factories=factories(lambda: DownProvider(""))) == 2
    )
    assert "LLM_UNAVAILABLE" in report.read_text(encoding="utf-8")


def test_embeddings_down_gives_exit_2(tmp_path, capsys):
    broken = factories(lambda: MockProvider(0.0), error=EmbeddingError("нет"))
    assert live_evals.main([str(tmp_path / "r.md")], env={}, factories=broken) == 2
    assert "Эмбеддинги недоступны" in capsys.readouterr().err


def test_default_factories_build_live_clients():
    settings = live_evals.live_settings({})
    make_provider, make_embedder = live_evals.make_factories(settings)
    assert type(make_provider()).__name__ == "OllamaProvider"
    assert type(make_embedder()).__name__ == "OllamaEmbedder"
