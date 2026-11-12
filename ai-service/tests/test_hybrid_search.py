"""Гибридный поиск (лексика + вектор, RRF): права до ранжирования, порог, fallback на лексику."""

import math

import pytest
from ai_test_support import (
    ALL_DOCS,
    DOC_A,
    DOC_A_REQUEST,
    DOC_B,
    DOC_NOTES,
    DOC_PRIVATE,
    DOC_PUBLIC,
    DOC_RESTRICTED,
    axis,
    greedy_scope,
    intern_a_scope,
    intern_c_scope,
)
from app.knowledge import chunk_document, load_corpus
from app.retrieval import RRF_K, VECTOR_MIN_SCORE, KnowledgeBase, cosine, fuse, ranks

DOCUMENTS = load_corpus()


def vectors_by_document() -> dict:
    """Каждому документу — своя ось: вопрос «по оси документа» похож только на него."""
    vectors = {}
    for index, document in enumerate(DOCUMENTS):
        for chunk in chunk_document(document):
            vectors[(document.id, chunk.position)] = axis(index)
    return vectors


def axis_of(document_id: str) -> list[float]:
    for index, document in enumerate(DOCUMENTS):
        if document.id == document_id:
            return axis(index)
    raise KeyError(document_id)


HYBRID = KnowledgeBase(DOCUMENTS, vectors_by_document())
LEXICAL = KnowledgeBase(DOCUMENTS)


def ids(hits) -> list[str]:
    return [hit.document.id for hit in hits]


def test_corpus_chunks_all_have_vectors():
    assert len(HYBRID.vectors) == len(HYBRID.chunks)


def test_without_query_vector_search_is_exactly_lexical():
    for query in ("как подключиться к базе", "заявка на доступ", "ORCHID-B", ""):
        hybrid = HYBRID.search(intern_a_scope(), query)
        lexical = LEXICAL.search(intern_a_scope(), query)
        assert [(hit.document.id, hit.score) for hit in hybrid] == [
            (hit.document.id, hit.score) for hit in lexical
        ]


def test_vector_finds_paraphrase_without_shared_words():
    # Лексика ничего не находит («с чего начать»), а вектор указывает на памятку.
    query = "с чего начать в первый день"
    assert LEXICAL.search(intern_a_scope(), query) == []
    hits = HYBRID.search(intern_a_scope(), query, query_vector=axis_of(DOC_PUBLIC))
    assert ids(hits) == [DOC_PUBLIC]


def test_agreement_of_both_lists_wins():
    query = "заявка на доступ к базе"
    lexical_first = ids(LEXICAL.search(intern_a_scope(), query))[0]
    hits = HYBRID.search(intern_a_scope(), query, query_vector=axis_of(lexical_first))
    assert ids(hits)[0] == lexical_first


@pytest.mark.parametrize("forbidden", [DOC_B, DOC_RESTRICTED, DOC_PRIVATE])
def test_vector_never_reaches_forbidden_documents(forbidden):
    # Вектор вопроса идеально совпадает с закрытым документом — его всё равно нет.
    for scope in (intern_a_scope(), greedy_scope()):
        hits = HYBRID.search(scope, "кодовое слово", query_vector=axis_of(forbidden))
        assert forbidden not in ids(hits)


def test_team_b_vector_query_sees_only_own_documents():
    hits = HYBRID.search(intern_c_scope(), "база", query_vector=axis_of(DOC_A))
    assert DOC_A not in ids(hits)
    assert set(ids(hits)) <= {DOC_B, DOC_PUBLIC, DOC_NOTES}


def test_weak_vector_similarity_is_ignored():
    # Косинус ниже порога: вектор ничего не добавляет, остаётся лексика.
    weak = [0.3] + [0.0] * 7
    other = [0.0, 1.0] + [0.0] * 6
    knowledge = KnowledgeBase(DOCUMENTS, {key: other for key in HYBRID.vectors})
    assert cosine(weak, other) < VECTOR_MIN_SCORE
    query = "с чего начать в первый день"
    assert knowledge.search(intern_a_scope(), query, query_vector=weak) == []


def test_chunks_without_vectors_are_found_only_lexically():
    partial = {key: value for key, value in HYBRID.vectors.items() if key[0] != DOC_A}
    knowledge = KnowledgeBase(DOCUMENTS, partial)
    hits = knowledge.search(intern_a_scope(), "первый день", query_vector=axis_of(DOC_A))
    assert DOC_A not in ids(hits)


def test_top_k_limits_hybrid_result():
    vector = [1.0] * 8  # похож на все документы одинаково
    hits = HYBRID.search(greedy_scope(), "база доступ заявка", top_k=2, query_vector=vector)
    assert len(hits) == 2


def test_rrf_uses_places_not_raw_scores():
    lexical = {("a", 0): 100.0, ("b", 0): 1.0}
    vector = {("b", 0): 0.9, ("a", 0): 0.8}
    fused = fuse(lexical, vector)
    # Каждый по разу первый и второй: суммы равны, хотя исходные числа очень разные.
    assert math.isclose(fused[("a", 0)], fused[("b", 0)])
    assert math.isclose(fused[("a", 0)], 1 / (RRF_K + 1) + 1 / (RRF_K + 2))


def test_ranks_break_ties_by_key():
    assert ranks({("b", 0): 1.0, ("a", 0): 1.0, ("c", 0): 2.0}) == {
        ("c", 0): 1,
        ("a", 0): 2,
        ("b", 0): 3,
    }


def test_cosine_of_zero_vector_is_zero():
    assert cosine([0.0, 0.0], [1.0, 0.0]) == 0.0
    assert math.isclose(cosine([1.0, 1.0], [2.0, 2.0]), 1.0)


def test_all_known_documents_listed():
    assert set(ALL_DOCS) == {document.id for document in DOCUMENTS}
    assert DOC_A_REQUEST in HYBRID.documents
