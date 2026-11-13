"""Поиск с правами: чужое не попадает ни в выдачу, ни в порядок, ни в excerpt."""

import pytest
from ai_test_support import (
    DOC_A,
    DOC_A_REQUEST,
    DOC_B,
    DOC_NOTES,
    DOC_PRIVATE,
    DOC_PUBLIC,
    DOC_RESTRICTED,
    SECRET_MARKERS,
    greedy_scope,
    intern_a_scope,
    intern_c_scope,
    knowledge,
    scope,
)
from app.acl import can_read
from app.contracts import COMMON_SCHEMA_ID, is_valid
from app.retrieval import excerpt, source_for, tokenize


def found(access_scope: dict, query: str) -> list[str]:
    return [hit.document.id for hit in knowledge().search(access_scope, query)]


def test_intern_a_finds_team_a_instruction():
    assert DOC_A in found(intern_a_scope(), "параметры подключения к тестовой базе")


def test_intern_a_finds_access_request_doc_first():
    assert found(intern_a_scope(), "заявка approved но доступа нет")[0] == DOC_A_REQUEST


def test_intern_c_does_not_see_team_a():
    result = found(intern_c_scope(), "параметры подключения к тестовой базе команды A")
    assert DOC_A not in result
    assert DOC_A_REQUEST not in result
    assert DOC_B in result


@pytest.mark.parametrize("marker", ["ORCHID-B", "CRIMSON-R", "PEARL-P телефон"])
def test_greedy_scope_still_cannot_reach_closed_documents(marker):
    assert found(greedy_scope(), marker) == []


def test_document_acl_rules():
    documents = knowledge().documents
    greedy = greedy_scope()
    assert can_read(greedy, documents[DOC_PUBLIC])
    assert can_read(greedy, documents[DOC_A])
    assert not can_read(greedy, documents[DOC_B])  # другая команда
    assert not can_read(greedy, documents[DOC_RESTRICTED])  # нет resource.view на db-restricted
    assert not can_read(greedy, documents[DOC_PRIVATE])  # PII никогда
    with_resource = scope("team-a", [DOC_RESTRICTED], {"db-restricted": ["resource.view"]})
    assert can_read(with_resource, documents[DOC_RESTRICTED])


def test_no_explicit_permission_means_no_access():
    empty = scope("team-a", [], {"db-team-a-test": ["resource.view"]})
    assert found(empty, "подключение к базе") == []
    assert knowledge().get(empty, DOC_PUBLIC) is None


def test_get_is_same_for_missing_and_forbidden():
    assert knowledge().get(intern_a_scope(), DOC_B) is None
    assert knowledge().get(intern_a_scope(), "00000099-0000-4000-8000-000000000099") is None
    assert knowledge().get(intern_a_scope(), DOC_A).id == DOC_A


def test_get_ref_checks_version():
    assert knowledge().get_ref(intern_a_scope(), {"document_id": DOC_A, "version": 1})
    assert knowledge().get_ref(intern_a_scope(), {"document_id": DOC_A, "version": 2}) is None


def test_forbidden_documents_do_not_change_ranking():
    """Статистика слов только по разрешённым: добавление чужих прав не двигает выдачу."""
    query = "подключение к базе ssl"
    own = knowledge().search(intern_a_scope(), query)
    greedy = knowledge().search(greedy_scope(), query)
    assert [hit.document.id for hit in own] == [hit.document.id for hit in greedy]


def test_top_k_and_empty_query():
    assert len(knowledge().search(intern_a_scope(), "подключение доступ база", 2)) == 2
    assert knowledge().search(intern_a_scope(), "и в на") == []


def test_sources_match_contract_and_hide_closed_text():
    hits = knowledge().search(greedy_scope(), "кодовое слово база подключение телефон")
    assert hits
    for hit in hits:
        source = source_for(hit.document, hit.chunk)
        assert is_valid("Source", source, COMMON_SCHEMA_ID), source
        assert source["url"] == f"/api/v2/knowledge/{hit.document.id}"
        for marker in SECRET_MARKERS:
            assert marker not in str(source)


def test_excerpt_is_short_and_without_title():
    hit = knowledge().search(intern_a_scope(), "подключение к базе")[0]
    text = excerpt(hit.chunk, hit.document)
    assert 0 < len(text) <= 301
    assert not text.startswith(hit.document.title)
    assert text in hit.document.content


def test_all_scoped_citations_match_the_raw_document_as_go_requires():
    # Regression for real Go/AI integration: normalized Markdown and inserted
    # ellipses passed AI schema tests but failed Go's anti-fabrication check.
    from app.knowledge import chunk_document

    kb = knowledge()
    for document in kb.documents.values():
        for chunk in chunk_document(document):
            source = source_for(document, chunk)
            assert source["excerpt"] and source["excerpt"] in document.content
            assert is_valid("Source", source, COMMON_SCHEMA_ID)


def test_tokenize_stems_and_synonyms():
    assert tokenize("Подключение подключиться") == {"подкл"}
    assert tokenize("база БД database") == {"бд"}
    assert tokenize("как и что") == set()


def test_notes_with_injection_are_public_data():
    assert DOC_NOTES in found(intern_a_scope(), "заметки стажёров о подключении")
