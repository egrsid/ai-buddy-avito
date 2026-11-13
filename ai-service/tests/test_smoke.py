"""Smoke платного API без сети: каталог — MockTransport, модель и эмбеддинги — фейки."""

import httpx
from ai_test_support import FakeEmbedder
from app import smoke
from app.budget import BudgetLedger
from app.vectors import EmbeddingError


def env_for(tmp_path, **extra) -> dict:
    values = {
        "LLM_MODE": "live",
        "LLM_PROVIDER": "openai",
        "LLM_BASE_URL": "https://api.example/v1",
        "LLM_MODEL": "chat-model",
        "LLM_API_KEY": "secret-key",
        "EMBEDDING_MODEL": "embed-model",
        "LLM_BUDGET_LEDGER_PATH": str(tmp_path / "budget.sqlite"),
        "LLM_PRICE_INPUT_RUB": "96.22",
        "LLM_PRICE_OUTPUT_RUB": "288.60",
        "EMBEDDING_PRICE_RUB": "0.61",
    }
    values.update(extra)
    return values


def catalog(*ids: str, status: int = 200):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer secret-key"
        return httpx.Response(status, json={"data": [{"id": model} for model in ids]})

    return httpx.MockTransport(handler)


class PaidProvider:
    """Как настоящий платный провайдер: резерв до вызова, факт — только в конце потока."""

    def __init__(self, ledger_path: str, chunks=("Ответ", " по делу")):
        self.ledger = BudgetLedger(ledger_path, 800)
        self.chunks = chunks

    async def stream(self, llm_input, scenario):
        reservation = self.ledger.reserve("chat", 0.01)
        for chunk in self.chunks:
            yield chunk
        self.ledger.settle(reservation, 0.001)

    async def warm_up(self) -> None:
        pass

    async def aclose(self) -> None:
        pass


def run(tmp_path, transport, provider_chunks=("Ответ",), embedder=None, **extra):
    env = env_for(tmp_path, **extra)
    path = env["LLM_BUDGET_LEDGER_PATH"]
    embedder = embedder or (lambda: FakeEmbedder(lambda text: [0.1] * 1024))
    factories = (lambda: PaidProvider(path, provider_chunks), embedder)
    report = tmp_path / "smoke.md"
    code = smoke.main([str(report)], env=env, factories=factories, models_transport=transport)
    return code, report, BudgetLedger(path, 800)


def test_all_checks_pass(tmp_path):
    code, report, ledger = run(tmp_path, catalog("chat-model", "embed-model"))
    assert code == 0
    text = report.read_text(encoding="utf-8")
    assert "| размерность эмбеддингов | OK | 1024 |" in text
    assert "FAIL" not in text
    # Пять generate-кейсов закрыты фактом, отменённый поток остался резервом.
    assert ledger.status() == {"spent_rub": 5 * 0.001 + 0.01, "calls": 6, "unsettled": 1}


def test_missing_model_stops_before_paid_calls(tmp_path):
    code, report, ledger = run(tmp_path, catalog("other-model", "embed-model"))
    assert code == 1
    assert ledger.status()["calls"] == 0
    assert "| модель chat-model в каталоге | FAIL |" in report.read_text(encoding="utf-8")


def test_catalog_error_stops(tmp_path):
    code, report, ledger = run(tmp_path, catalog(status=401))
    assert code == 1
    assert ledger.status()["calls"] == 0
    assert "HTTPStatusError" in report.read_text(encoding="utf-8")


def test_wrong_dimension_fails(tmp_path):
    embedder = lambda: FakeEmbedder(lambda text: [0.1] * 768)  # noqa: E731
    code, report, _ = run(tmp_path, catalog("chat-model", "embed-model"), embedder=embedder)
    assert code == 1
    assert "| размерность эмбеддингов | FAIL | 768 |" in report.read_text(encoding="utf-8")


def test_embedding_error_fails(tmp_path):
    embedder = lambda: FakeEmbedder(error=EmbeddingError("бюджет"))  # noqa: E731
    code, report, _ = run(tmp_path, catalog("chat-model", "embed-model"), embedder=embedder)
    assert code == 1
    assert "| эмбеддинги | FAIL | бюджет |" in report.read_text(encoding="utf-8")


def test_empty_answer_fails_generate_and_cancel(tmp_path):
    code, report, _ = run(tmp_path, catalog("chat-model", "embed-model"), provider_chunks=())
    assert code == 1
    text = report.read_text(encoding="utf-8")
    assert "| generate gen-iam-absent | FAIL |" in text
    assert "| отмена потока оставляет резерв | FAIL |" in text


def test_only_for_paid_provider(tmp_path, capsys):
    assert smoke.main([], env=env_for(tmp_path, LLM_PROVIDER="ollama")) == 2
    assert smoke.main([], env=env_for(tmp_path, LLM_PRICE_INPUT_RUB="")) == 2
    assert "Конфигурация" in capsys.readouterr().err
