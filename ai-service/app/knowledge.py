"""Synthetic корпус знаний: загрузка Markdown с метаданными и нарезка на фрагменты.

Формат файла: YAML front matter (id, title, version, visibility, team_id?, resource_id?)
и текст Markdown. visibility: public | team | restricted | private.
"""

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

import yaml

CORPUS_DIR = Path(__file__).resolve().parents[2] / "data" / "knowledge" / "v2"
VISIBILITIES = ("public", "team", "restricted", "private")
# Базовая нарезка из ai-design.md: 600–1000 символов, перекрытие 100.
CHUNK_MAX = 1000
CHUNK_OVERLAP = 100


class CorpusError(Exception):
    """Файл корпуса нарушает формат: ingest должен упасть, а не пропустить его молча."""


@dataclass(frozen=True)
class Document:
    id: str
    title: str
    version: int
    visibility: str
    team_id: str | None
    resource_id: str | None
    content: str
    content_hash: str


@dataclass(frozen=True)
class Chunk:
    document_id: str
    document_version: int
    position: int
    text: str


def parse_document(raw: str, name: str) -> Document:
    parts = raw.split("---\n", 2)
    if len(parts) != 3 or parts[0] != "":
        raise CorpusError(f"{name}: нет блока метаданных ---")
    meta = yaml.safe_load(parts[1])
    content = parts[2].strip()
    required = ("id", "title", "version", "visibility")
    for key in required:
        if key not in meta:
            raise CorpusError(f"{name}: нет поля {key}")
    if meta["visibility"] not in VISIBILITIES:
        raise CorpusError(f"{name}: неизвестная visibility")
    if meta["visibility"] in ("team", "restricted") and not meta.get("team_id"):
        raise CorpusError(f"{name}: для team/restricted нужен team_id")
    if meta["visibility"] == "restricted" and not meta.get("resource_id"):
        raise CorpusError(f"{name}: для restricted нужен resource_id")
    if "не регламент Авито" not in content:
        raise CorpusError(f"{name}: нет пометки «не регламент Авито»")
    return Document(
        id=str(meta["id"]),
        title=str(meta["title"]),
        version=int(meta["version"]),
        visibility=meta["visibility"],
        team_id=meta.get("team_id"),
        resource_id=meta.get("resource_id"),
        content=content,
        content_hash=hashlib.sha256(content.encode("utf-8")).hexdigest(),
    )


def load_corpus(directory: Path = CORPUS_DIR) -> list[Document]:
    documents = []
    seen = set()
    for path in sorted(directory.glob("*.md")):
        document = parse_document(path.read_text(encoding="utf-8"), path.name)
        if document.id in seen:
            raise CorpusError(f"{path.name}: повтор id")
        seen.add(document.id)
        documents.append(document)
    return documents


def markdown_to_text(markdown: str) -> str:
    """Убирает разметку заголовков, списков и выделения; абзацы разделены пустой строкой."""
    lines = []
    for line in markdown.splitlines():
        line = re.sub(r"^#+\s*", "", line)
        line = re.sub(r"^\s*(?:[-*]|\d+\.)\s+", "", line)
        line = line.replace("**", "").replace("`", "")
        lines.append(line.strip())
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def split_long(paragraph: str) -> list[str]:
    """Режет слишком длинный абзац окнами CHUNK_MAX с перекрытием CHUNK_OVERLAP."""
    pieces = []
    start = 0
    while start < len(paragraph):
        pieces.append(paragraph[start : start + CHUNK_MAX])
        if start + CHUNK_MAX >= len(paragraph):
            break
        start += CHUNK_MAX - CHUNK_OVERLAP
    return pieces


def chunk_document(document: Document) -> list[Chunk]:
    """Склеивает абзацы во фрагменты до CHUNK_MAX; заголовок документа — в каждом фрагменте."""
    texts = []
    current = ""
    for paragraph in markdown_to_text(document.content).split("\n\n"):
        for piece in split_long(paragraph):
            if current and len(current) + 2 + len(piece) > CHUNK_MAX:
                texts.append(current)
                # Перекрытие: хвост прошлого фрагмента начинает следующий.
                current = current[-CHUNK_OVERLAP:] + "\n\n" + piece
            else:
                current = piece if not current else current + "\n\n" + piece
    if current:
        texts.append(current)
    return [
        Chunk(document.id, document.version, position, f"{document.title}\n\n{text}")
        for position, text in enumerate(texts)
    ]
