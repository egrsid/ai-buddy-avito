"""Лексический поиск по знаниям с фильтром прав ДО ранжирования.

Это offline baseline (не vector RAG): совпадение основ слов, вес редких слов выше (IDF).
Статистика слов считается только по разрешённым фрагментам, поэтому чужие документы
не влияют даже на порядок выдачи.
"""

import math
import re
from dataclasses import dataclass

from app.acl import can_read
from app.knowledge import Chunk, Document, chunk_document

STEM_LENGTH = 5
EXCERPT_LENGTH = 300
STOP_WORDS = {
    "как", "что", "это", "для", "или", "мне", "меня", "нужно", "надо", "где", "когда",
    "если", "его", "она", "они", "так", "уже", "все", "при", "без", "над", "под",
    "на", "по", "из", "от", "до", "за", "не", "но", "же", "ли", "бы", "то", "мы", "вы", "он",
    "the", "and", "for",
}  # fmt: skip


def normalize_word(word: str) -> str:
    """Грубая основа слова: синоним «база» -> «бд», затем первые STEM_LENGTH букв."""
    if word.startswith("баз") or word in ("db", "database", "postgres", "postgresql"):
        return "бд"
    return word[:STEM_LENGTH]


def tokenize(text: str) -> set[str]:
    words = re.findall(r"[a-zа-я0-9_]+", text.lower().replace("ё", "е"))
    return {normalize_word(word) for word in words if len(word) >= 2 and word not in STOP_WORDS}


@dataclass(frozen=True)
class Hit:
    document: Document
    chunk: Chunk
    score: float


def excerpt(chunk: Chunk, document: Document) -> str:
    text = chunk.text.removeprefix(document.title).strip()
    text = " ".join(text.split())
    if len(text) <= EXCERPT_LENGTH:
        return text
    cut = text[:EXCERPT_LENGTH].rsplit(" ", 1)[0]
    return cut + "…"


def source_for(document: Document, chunk: Chunk) -> dict:
    """Source из общего контракта. URL строим сами из ID, не из текста документа."""
    return {
        "document_id": document.id,
        "version": document.version,
        "title": document.title,
        "url": f"/api/v2/knowledge/{document.id}",
        "excerpt": excerpt(chunk, document),
    }


class KnowledgeBase:
    def __init__(self, documents: list[Document]):
        self.documents = {document.id: document for document in documents}
        self.title_tokens = {document.id: tokenize(document.title) for document in documents}
        self.chunks = []
        for document in documents:
            for chunk in chunk_document(document):
                self.chunks.append((chunk, tokenize(chunk.text)))

    def get(self, scope: dict, document_id: str) -> Document | None:
        """Документ, если он есть и разрешён; иначе None (одинаково для «нет» и «нельзя»)."""
        document = self.documents.get(document_id)
        if document is None or not can_read(scope, document):
            return None
        return document

    def first_chunk(self, document_id: str) -> Chunk:
        for chunk, _ in self.chunks:
            if chunk.document_id == document_id:
                return chunk
        raise KeyError(document_id)

    def get_ref(self, scope: dict, ref: dict) -> Document | None:
        """Документ по InstructionRef, только если разрешён и версия совпадает."""
        document = self.get(scope, ref["document_id"])
        if document is None or document.version != ref["version"]:
            return None
        return document

    def search(self, scope: dict, query: str, top_k: int = 5) -> list[Hit]:
        # 1. Фильтр прав — до любого подсчёта.
        allowed = []
        for chunk, tokens in self.chunks:
            if can_read(scope, self.documents[chunk.document_id]):
                allowed.append((chunk, tokens))
        query_tokens = tokenize(query)
        if not allowed or not query_tokens:
            return []

        # 2. Вес слова: чем реже среди разрешённых фрагментов, тем важнее.
        weights = {}
        for token in query_tokens:
            frequency = sum(1 for _, tokens in allowed if token in tokens)
            if frequency:
                weights[token] = math.log(1 + len(allowed) / frequency)

        # 3. Лучший фрагмент каждого документа.
        best = {}
        for chunk, tokens in allowed:
            title = self.title_tokens[chunk.document_id]
            score = 0.0
            for token, weight in weights.items():
                if token in tokens:
                    score += weight
                # Совпадение с названием документа весит вдвое: оно точнее говорит о теме.
                if token in title:
                    score += weight
            if score <= 0:
                continue
            current = best.get(chunk.document_id)
            if current is None or score > current.score:
                best[chunk.document_id] = Hit(self.documents[chunk.document_id], chunk, score)

        hits = sorted(best.values(), key=lambda hit: (-hit.score, hit.document.id))
        return hits[:top_k]
