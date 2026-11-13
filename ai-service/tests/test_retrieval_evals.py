"""Замер retrieval (лексика против гибрида) без сети: fake-эмбеддер кладёт документы на оси."""

from ai_test_support import FakeEmbedder, axis
from app import retrieval_evals
from app.knowledge import load_corpus
from app.vectors import EmbeddingError

DOCUMENTS = load_corpus()


def by_title(text: str) -> list[float]:
    """Фрагмент — ось своего документа; вопрос — ось, которой нет ни у кого."""
    for index, document in enumerate(DOCUMENTS):
        if text.startswith(document.title):
            return axis(index)
    return axis(7)


def test_cases_include_own_and_generate_cases():
    scopes, cases = retrieval_evals.load_cases()
    ids = {case["id"] for case in cases}
    assert "para-first-day" in ids
    assert "gen-db-ssl-required" in ids
    assert all(case["scope"] in scopes for case in cases)


def test_main_writes_report_without_leaks(tmp_path, capsys):
    fake = FakeEmbedder(by_title)
    report = tmp_path / "report.md"
    assert retrieval_evals.main([str(report)], lambda settings: fake) == 0
    text = report.read_text(encoding="utf-8")
    assert "| Документы вне прав (safety) | — | 0 |" in text
    assert "para-first-day" in text
    assert "aclose" in fake.lifecycle
    assert "утечек 0" in capsys.readouterr().out


def test_embeddings_down_exit_2(tmp_path, capsys):
    fake = FakeEmbedder(error=EmbeddingError("down"))
    assert retrieval_evals.main([str(tmp_path / "r.md")], lambda settings: fake) == 2
    assert "Эмбеддинги недоступны" in capsys.readouterr().err


def test_summary_counts_places_and_leaks():
    rows = [
        {"expected": "a", "lexical": ["a", "b"], "hybrid": ["b", "a"], "leaks": []},
        {"expected": "c", "lexical": [], "hybrid": ["c"], "leaks": ["x"]},
    ]
    summary = retrieval_evals.summarize(rows)
    assert summary == {
        "total": 2,
        "leaks": 1,
        "lexical_top1": 1,
        "lexical_top3": 1,
        "hybrid_top1": 1,
        "hybrid_top3": 2,
    }
    assert retrieval_evals.place(["b", "a"], "a") == "2"
    assert retrieval_evals.place([], "a") == "—"


def test_leak_gives_exit_1(tmp_path, monkeypatch):
    async def leaky(scopes, cases, embedder):
        return [{"id": "x", "query": "q", "expected": "a", "lexical": [], "hybrid": ["b"],
                 "leaks": ["b"]}]  # fmt: skip

    monkeypatch.setattr(retrieval_evals, "compare", leaky)
    fake = FakeEmbedder()
    assert retrieval_evals.main([str(tmp_path / "r.md")], lambda settings: fake) == 1


def test_default_embedder_is_ollama():
    from app.embeddings import OllamaEmbedder

    settings = retrieval_evals.Settings(internal_api_token="t", llm_base_url="http://o:1")
    assert isinstance(retrieval_evals.make_embedder(settings), OllamaEmbedder)
