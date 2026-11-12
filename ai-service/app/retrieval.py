"""Поиск по знаниям с фильтром прав ДО ранжирования.

Лексический поиск (offline baseline, mock): совпадение основ слов, вес редких слов выше
(IDF). Статистика слов считается только по разрешённым фрагментам, поэтому чужие
документы не влияют даже на порядок выдачи.

Гибрид (live): если есть вектор вопроса и векторы фрагментов, два списка — лексический
и векторный (косинус) — сливаются по местам (Reciprocal Rank Fusion). Замер на корпусе:
лексический точнее на кодах ошибок, вектор — на перефразировках; вместе лучше.
"""

import math
import re
from dataclasses import dataclass

from app.acl import can_read
from app.knowledge import Chunk, Document, chunk_document

STEM_LENGTH = 5
# RRF: место r в списке даёт 1/(RRF_K + r). 60 — стандартное значение из статьи о RRF.
RRF_K = 60
# Ниже этого косинуса фрагмент для вектора «не про то» (замер bge-m3 на корпусе:
# нужные документы 0.52–0.61, чужие 0.39–0.46). Иначе вектор всегда тащит top_k.
VECTOR_MIN_SCORE = 0.5
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


def cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    norm = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    return dot / norm if norm else 0.0


def ranks(scores: dict[tuple[str, int], float]) -> dict[tuple[str, int], int]:
    """Место каждого фрагмента: 1 — лучший; при равенстве порядок по ключу."""
    ordered = sorted(scores, key=lambda key: (-scores[key], key))
    return {key: place for place, key in enumerate(ordered, start=1)}


def fuse(*score_lists: dict[tuple[str, int], float]) -> dict[tuple[str, int], float]:
    """Reciprocal Rank Fusion: важны места в списках, а не сами числа (у них разные шкалы)."""
    fused = {}
    for scores in score_lists:
        for key, place in ranks(scores).items():
            fused[key] = fused.get(key, 0.0) + 1 / (RRF_K + place)
    return fused


class KnowledgeBase:
    def __init__(
        self,
        documents: list[Document],
        vectors: dict[tuple[str, int], list[float]] | None = None,
    ):
        """vectors: (document_id, position) -> эмбеддинг фрагмента; None — только лексика."""
        self.documents = {document.id: document for document in documents}
        self.title_tokens = {document.id: tokenize(document.title) for document in documents}
        self.chunks = []
        for document in documents:
            for chunk in chunk_document(document):
                self.chunks.append((chunk, tokenize(chunk.text)))
        self.vectors = vectors or {}

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

    def search(
        self,
        scope: dict,
        query: str,
        top_k: int = 5,
        query_vector: list[float] | None = None,
    ) -> list[Hit]:
        # 1. Фильтр прав — до любого подсчёта, и для лексики, и для вектора.
        allowed = []
        for chunk, tokens in self.chunks:
            if can_read(scope, self.documents[chunk.document_id]):
                allowed.append((chunk, tokens))
        if not allowed:
            return []

        # 2. Оценки фрагментов: лексика всегда, вектор — если он есть (live).
        scores = self.lexical_scores(allowed, query)
        if query_vector is not None and self.vectors:
            scores = fuse(scores, self.vector_scores(allowed, query_vector))

        # 3. Лучший фрагмент каждого документа.
        best = {}
        for chunk, _ in allowed:
            score = scores.get((chunk.document_id, chunk.position), 0.0)
            if score <= 0:
                continue
            current = best.get(chunk.document_id)
            if current is None or score > current.score:
                best[chunk.document_id] = Hit(self.documents[chunk.document_id], chunk, score)

        hits = sorted(best.values(), key=lambda hit: (-hit.score, hit.document.id))
        return hits[:top_k]

    def lexical_scores(self, allowed: list, query: str) -> dict[tuple[str, int], float]:
        query_tokens = tokenize(query)
        # Вес слова: чем реже среди разрешённых фрагментов, тем важнее.
        weights = {}
        for token in query_tokens:
            frequency = sum(1 for _, tokens in allowed if token in tokens)
            if frequency:
                weights[token] = math.log(1 + len(allowed) / frequency)

        scores = {}
        for chunk, tokens in allowed:
            title = self.title_tokens[chunk.document_id]
            score = 0.0
            for token, weight in weights.items():
                if token in tokens:
                    score += weight
                # Совпадение с названием документа весит вдвое: оно точнее говорит о теме.
                if token in title:
                    score += weight
            if score > 0:
                scores[(chunk.document_id, chunk.position)] = score
        return scores

    def vector_scores(
        self, allowed: list, query_vector: list[float]
    ) -> dict[tuple[str, int], float]:
        scores = {}
        for chunk, _ in allowed:
            key = (chunk.document_id, chunk.position)
            vector = self.vectors.get(key)
            if vector is None:
                continue
            score = cosine(query_vector, vector)
            if score >= VECTOR_MIN_SCORE:
                scores[key] = score
        return scores
