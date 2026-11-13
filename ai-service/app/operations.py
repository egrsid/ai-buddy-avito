"""Структурированные AI-операции (не поток). Сейчас — детерминированные правила.

Они же станут fallback, когда появится live-модель: если LLM недоступна или вернула
ответ не по схеме, отдаём результат этих функций. Все ответы — гипотезы и черновики,
не evidence: состояние шагов меняет только Go.
"""

from app.redaction import redact
from app.retrieval import KnowledgeBase, source_for, tokenize

HYPOTHESIS_NOTE = "Это гипотеза, а не проверенный факт."
ERROR_TO_BLOCKER = {
    "ACCESS_MISSING": "access_missing",
    "ACCESS_DENIED": "access_denied",
    "DB_SSL_REQUIRED": "db_ssl_required",
    "CHECK_UNAVAILABLE": "check_unavailable",
}
EXPLANATIONS = {
    "ACCESS_MISSING": "Похоже, роли на ресурс пока нет: проверка не нашла выданного доступа. "
    "Заявка в статусе submitted или approved ещё не означает доступ.",
    "ACCESS_DENIED": "Похоже, доступ к ресурсу отклонён политикой или решением approver.",
    "DB_SSL_REQUIRED": "Похоже, учебная база требует шифрованное соединение (SSL), "
    "а подключение шло без него.",
    "CHECK_UNAVAILABLE": "Учебная проверка сейчас недоступна; это не говорит об ошибке стажёра.",
}
GAP_TEXTS = {
    "ACCESS_MISSING": (
        "инструкция, возможно, не объясняет, что доступ появляется только после выдачи роли, "
        "а не после статуса submitted или approved.",
        "Добавить в инструкцию различие submitted / approved / роль выдана и шаг проверки роли.",
    ),
    "ACCESS_DENIED": (
        "в инструкции может быть указан неверный ресурс или роль.",
        "Сверить ресурс и роль в инструкции с политикой доступа учебной среды.",
    ),
    "DB_SSL_REQUIRED": (
        "инструкция не требует шифрованного соединения, а учебная база его требует.",
        "Указать в инструкции ssl_mode=require для подключения и объяснить ошибку DB_SSL_REQUIRED.",
    ),
    "CHECK_UNAVAILABLE": (
        "причина может быть не в инструкции, а в доступности учебной проверки.",
        "Проверить доступность учебной проверки и описать в инструкции, что делать при "
        "CHECK_UNAVAILABLE.",
    ),
}
MAX_QUESTION = 4000
# В уточняющий вопрос идут до 5 названий маршрутов по <=200 символов, а лимит ответа — 1000.
# 5 названий по 150 символов вместе с текстом вопроса — около 800 символов.
MAX_TITLE_IN_QUESTION = 150


def short_title(title: str) -> str:
    if len(title) <= MAX_TITLE_IN_QUESTION:
        return title
    return title[: MAX_TITLE_IN_QUESTION - 1].rstrip() + "…"


def select_journey(body: dict) -> dict:
    """Выбор маршрута только из allowed_journeys; при сомнении — уточняющий вопрос."""
    intent = tokenize(body["intent"])
    scored = []
    for journey in body["allowed_journeys"]:
        words = tokenize(journey["title"] + " " + journey["journey_id"].replace("-", " "))
        scored.append((len(intent & words), journey))
    scored.sort(key=lambda item: -item[0])
    best_score, best = scored[0]
    tie = len(scored) > 1 and scored[1][0] == best_score
    if best_score > 0 and not tie:
        return {"journey_id": best["journey_id"], "version": best["version"]}
    titles = "; ".join(f"«{short_title(journey['title'])}»" for _, journey in scored[:5])
    return {"clarification": f"Уточните, какая цель вам нужна: {titles}?"}


def classify_error(body: dict) -> dict:
    """Тип блокера только из allowed_blocker_types; уверенность — гипотеза, не факт."""
    allowed = body["allowed_blocker_types"]
    blocker_type = ERROR_TO_BLOCKER[body["error_code"]]
    if blocker_type in allowed:
        explanation = f"{EXPLANATIONS[body['error_code']]} {HYPOTHESIS_NOTE}"
        return {"blocker_type": blocker_type, "explanation": explanation, "confidence": "high"}
    fallback = "check_unavailable" if "check_unavailable" in allowed else allowed[0]
    explanation = f"Не удалось уверенно определить причину. {HYPOTHESIS_NOTE}"
    return {"blocker_type": fallback, "explanation": explanation, "confidence": "low"}


def permitted_sources(knowledge: KnowledgeBase, scope: dict, refs: list[dict]) -> list[dict]:
    """InstructionRef -> Source только для разрешённых документов с той же версией."""
    sources = []
    for ref in refs:
        document = knowledge.get_ref(scope, ref)
        if document is None:
            continue
        chunk = knowledge.first_chunk(document.id)
        sources.append(source_for(document, chunk))
    return sources


def diagnostic_summary(body: dict, knowledge: KnowledgeBase) -> dict:
    """DiagnosticSnapshot для buddy: без переписки, секретов и закрытых документов."""
    blocker = body["blocker"]
    question = " ".join(redact(body.get("intern_question", "")).split())
    if not question:
        question = (
            f"Шаг «{body['step']['title']}» заблокирован ошибкой {blocker['error_code']}. "
            "Подскажите, что проверить?"
        )
    hypothesis = f"{EXPLANATIONS[blocker['error_code']]} {HYPOTHESIS_NOTE}"
    return {
        "goal": body["goal"],
        "step": body["step"],
        "blocker": blocker,
        "checks": body["checks"],
        "attempted_actions": body["attempted_actions"],
        "instruction_refs": permitted_sources(
            knowledge, body["access_scope"], body["instruction_refs"]
        ),
        "hypotheses": [{"text": hypothesis, "confidence": "medium"}],
        "question": question[:MAX_QUESTION],
    }


def knowledge_gap_draft(body: dict, knowledge: KnowledgeBase) -> dict | None:
    """Черновик карточки для docs-owner или None, если ни одна инструкция не разрешена.

    Отделяет наблюдение (сколько разных стажёров и где упали) от гипотезы о дефекте.
    Без ID и имён людей.
    """
    documents = []
    for ref in body["instruction_refs"]:
        document = knowledge.get_ref(body["access_scope"], ref)
        if document is not None:
            documents.append(document)
    if not documents:
        return None
    error_code = body["error_code"]
    gap, fix = GAP_TEXTS[error_code]
    titles = ", ".join(f"«{document.title}» v{document.version}" for document in documents)
    hypothesis = (
        f"Наблюдение: {body['affected_count']} разных стажёров на шаге {body['step_id']} "
        f"маршрута {body['journey_id']} получили {error_code}. "
        f"Гипотеза (требует проверки владельцем): в {titles} {gap}"
    )
    if error_code == "DB_SSL_REQUIRED":
        if any("ssl_mode=disable" in document.content for document in documents):
            hypothesis += " В инструкции явно указано ssl_mode=disable."
    return {
        "hypothesis": hypothesis[:2000],
        "proposed_fix": fix,
        "source_refs": [{"document_id": doc.id, "version": doc.version} for doc in documents],
    }
