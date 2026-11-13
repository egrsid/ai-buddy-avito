"""Детерминированный offline-провайдер (LLM_MODE=mock): без сети, ключа и модели.

Отдаёт текст кусками, как настоящая LLM в потоке. Тот же интерфейс получит
live-адаптер: async-генератор stream(llm_input, scenario), отдающий куски текста,
и ProviderUnavailable при недоступности. Mock строит ответ из структурированного
контекста (цель, разрешённые фрагменты), live — из llm_input.messages.
"""

import asyncio
import re
from collections.abc import AsyncIterator

from app.prompt import LlmInput, action_labels, goal_summary, last_user_message
from app.redaction import redact

WORDS_PER_CHUNK = 3
# Латинские слова, которые не считаем неизвестными терминами.
COMMON_TERMS = {
    "ssl", "sql", "iam", "db", "api", "ok", "postgres", "postgresql", "ai", "buddy",
    # Роли и статусы предметной области — не «неизвестные термины».
    "admin", "write", "verified", "submitted", "approved", "rejected", "mock",
}  # fmt: skip
MAX_UNKNOWN_TERMS = 3


class ProviderUnavailable(Exception):
    """Провайдер LLM недоступен (сеть, 5xx, неверный ключ)."""


class BudgetDenied(ProviderUnavailable):
    """Не пытаться вызвать другую платную модель после отказа budget guard."""


def current_step(goal_context: dict) -> dict | None:
    for step in goal_context["steps"]:
        if step["id"] == goal_context["current_step_id"]:
            return step
    return None


def unknown_terms(llm_input: LlmInput) -> list[str]:
    """Латинские термины из вопроса, которых нет ни в разрешённых фрагментах, ни в контексте
    цели (коды блокеров, шаги, действия, ресурс — их система знает, это не выдумка)."""
    known_parts = [hit.chunk.text.lower() for hit in llm_input.hits]
    goal_context = llm_input.request.get("goal_context")
    if goal_context is not None:
        known_parts.append(goal_summary(goal_context).lower())
        # id шагов и действий в сводке заменены словами, но система их знает.
        known_parts.extend(step["id"].lower() for step in goal_context["steps"])
        known_parts.extend(goal_context["next_actions"])
    known_text = " ".join(known_parts)
    # Сначала вычищаем секреты и убираем ссылки/DSN: их нельзя повторять в ответе.
    question = re.sub(r"\S+://\S+", " ", redact(last_user_message(llm_input.request)))
    terms = []
    for word in re.findall(r"[A-Za-z][A-Za-z0-9_-]*[A-Za-z0-9]", question):
        lowered = word.lower()
        if lowered in COMMON_TERMS or lowered in known_text or word in terms:
            continue
        terms.append(word)
    return terms[:MAX_UNKNOWN_TERMS]


def goal_part(goal_context: dict) -> list[str]:
    parts = []
    step = current_step(goal_context)
    if step is not None:
        parts.append(f"Сейчас твой шаг: «{step['title']}».")
        for blocker in step["blockers"]:
            if blocker["status"] == "open":
                parts.append(f"На шаге открыт блокер {blocker['error_code']}.")
    if goal_context["next_actions"]:
        actions = action_labels(goal_context["next_actions"])
        parts.append(f"Допустимые следующие действия: {actions}.")
    return parts


def mock_answer(llm_input: LlmInput) -> str:
    """Шаблонный ответ. Сообщения пользователя не цитирует, кроме названий неизвестных терминов."""
    parts = ["Режим mock, без LLM."]
    terms = unknown_terms(llm_input)
    if terms:
        parts.append(
            f"Я не знаю, что такое {', '.join(terms)}: в доступных материалах этого нет. "
            "Не буду угадывать — уточни у buddy."
        )
    goal_context = llm_input.request.get("goal_context")
    if goal_context is None:
        parts.append("Цель пока не выбрана: опиши, что нужно сделать, и я подберу маршрут.")
    else:
        parts.extend(goal_part(goal_context))
    if llm_input.hits:
        titles = "; ".join(f"«{hit.document.title}»" for hit in llm_input.hits[:3])
        parts.append(f"Подходящие материалы: {titles}.")
    parts.append("Выполнение шага подтверждает только проверка системы.")
    return " ".join(parts)


def split_into_chunks(text: str) -> list[str]:
    words = text.split(" ")
    chunks = []
    for start in range(0, len(words), WORDS_PER_CHUNK):
        chunk = " ".join(words[start : start + WORDS_PER_CHUNK])
        if start + WORDS_PER_CHUNK < len(words):
            chunk += " "
        chunks.append(chunk)
    return chunks


def invalid_tool_proposal(request: dict) -> dict:
    """Для сценария invalid_tool: заведомо неверное предложение, Go обязан его отклонить.

    Лишнее поле actor и недопустимая роль нарушают AccessRequestParameters.
    """
    goal_context = request.get("goal_context") or {}
    return {
        "run_id": request["run_id"],
        "type": "create_access_request",
        "parameters": {
            "resource_id": goal_context.get("resource_id", "unknown"),
            "requested_role": "admin",
            "reason": "mock invalid_tool",
            "additional_fields": {},
            "actor": "intern",
        },
        "goal_id": goal_context.get("goal_id", request["run_id"]),
        "step_id": goal_context.get("current_step_id", "unknown"),
    }


class MockProvider:
    def __init__(self, slow_stream_delay: float = 1.0):
        self.slow_stream_delay = slow_stream_delay

    async def stream(self, llm_input: LlmInput, scenario: str) -> AsyncIterator[str]:
        if scenario == "unavailable":
            raise ProviderUnavailable("mock: провайдер недоступен")
        if scenario == "timeout":
            # Молчим, пока пайплайн не отменит запрос по таймеру первого токена.
            await asyncio.Event().wait()
        for chunk in split_into_chunks(mock_answer(llm_input)):
            if scenario == "slow_stream":
                await asyncio.sleep(self.slow_stream_delay)
            yield chunk

    async def warm_up(self) -> None:
        """Прогревать нечего: метод нужен, чтобы api вызывал его у любого провайдера."""

    async def aclose(self) -> None:
        """Закрывать нечего (у live-провайдера здесь закрывается HTTP-клиент)."""
