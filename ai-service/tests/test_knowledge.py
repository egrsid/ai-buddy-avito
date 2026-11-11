"""Корпус: формат файлов, пометка synthetic, нарезка на фрагменты."""

import pytest
from app.knowledge import (
    CHUNK_MAX,
    CHUNK_OVERLAP,
    CorpusError,
    Document,
    chunk_document,
    load_corpus,
    markdown_to_text,
    parse_document,
)

HEADER = "---\nid: x\ntitle: T\nversion: 1\nvisibility: {visibility}\n{extra}---\n"
BODY = "Синтетика, не регламент Авито.\n"


def make(visibility="public", extra="", body=BODY) -> str:
    return HEADER.format(visibility=visibility, extra=extra) + body


def test_corpus_loads_all_documents_with_mark_and_unique_ids():
    documents = load_corpus()
    assert len(documents) == 7
    assert len({document.id for document in documents}) == 7
    for document in documents:
        assert "не регламент Авито" in document.content
        assert len(document.content_hash) == 64


def test_demo_instruction_carries_the_ssl_defect():
    documents = {document.id: document for document in load_corpus()}
    instruction = documents["0000000a-0000-4000-8000-00000000000a"]
    assert "ssl_mode=disable" in instruction.content
    assert instruction.visibility == "team"
    assert instruction.team_id == "team-a"


@pytest.mark.parametrize(
    "raw",
    [
        "без метаданных",
        make(visibility="secret"),
        make(visibility="team"),
        make(visibility="restricted", extra="team_id: team-a\n"),
        make(body="нет пометки"),
        "---\nid: x\ntitle: T\n---\n" + BODY,
    ],
)
def test_bad_files_fail_loudly(raw):
    with pytest.raises(CorpusError):
        parse_document(raw, "bad.md")


def test_duplicate_ids_fail(tmp_path):
    (tmp_path / "a.md").write_text(make(), encoding="utf-8")
    (tmp_path / "b.md").write_text(make(), encoding="utf-8")
    with pytest.raises(CorpusError):
        load_corpus(tmp_path)


def test_markdown_is_flattened():
    text = markdown_to_text("# Заголовок\n\n- пункт **жирный**\n1. шаг `код`\n\n\n\nконец")
    assert text == "Заголовок\n\nпункт жирный\nшаг код\n\nконец"


def document_with(content: str) -> Document:
    return Document("x", "Название", 2, "public", None, None, content, "h")


def test_short_document_is_one_chunk_with_title():
    chunks = chunk_document(document_with("Короткий текст."))
    assert len(chunks) == 1
    assert chunks[0].text.startswith("Название\n\n")
    assert chunks[0].document_version == 2


def test_long_document_is_split_with_overlap():
    paragraphs = "\n\n".join(f"Абзац {index} " + "слово " * 60 for index in range(10))
    chunks = chunk_document(document_with(paragraphs))
    assert len(chunks) > 1
    assert [chunk.position for chunk in chunks] == list(range(len(chunks)))
    for chunk in chunks:
        assert len(chunk.text) <= len("Название\n\n") + CHUNK_MAX + CHUNK_OVERLAP + 2
    # Хвост прошлого фрагмента повторяется в начале следующего.
    first_tail = chunks[0].text[-CHUNK_OVERLAP:]
    assert first_tail in chunks[1].text


def test_huge_paragraph_is_cut_into_windows():
    chunks = chunk_document(document_with("я" * 2500))
    assert len(chunks) >= 3
