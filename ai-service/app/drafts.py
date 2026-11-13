"""Черновик заявки на доступ: общий для /access-request-draft и tool.proposed в /generate.

AI только предлагает: Go проверяет черновик, показывает preview и ждёт подтверждения.
Поля actor/role/buddy/state не выдаём — их подставляет Go.
"""

from app.acl import permissions_for
from app.redaction import redact

DEFAULT_ROLE = "db_reader"  # единственная запрашиваемая роль P0
# Действия, после которых новую заявку предлагать рано: прошлая ещё в работе или успешна.
ACTIVE_ACTION_STATUSES = ("pending_confirmation", "executing", "succeeded", "unknown")
MAX_REASON = 1000


def can_request(scope: dict, resource_id: str) -> bool:
    return "access.request" in permissions_for(
        scope["resource_permissions"], "resource_id", resource_id
    )


def template_reason(resource_id: str, step_id: str) -> str:
    return (
        f"Нужен доступ {DEFAULT_ROLE} к {resource_id} для шага {step_id} учебной цели онбординга."
    )


def access_parameters(resource_id: str, reason: str) -> dict:
    return {
        "resource_id": resource_id,
        "requested_role": DEFAULT_ROLE,
        "reason": reason[:MAX_REASON],
        "additional_fields": {},
    }


def access_request_draft(body: dict) -> dict:
    """Ответ /access-request-draft: параметры заявки или {missing_fields, question}."""
    resource_id = body["permitted_resource"]
    missing = []
    if not can_request(body["access_scope"], resource_id):
        missing.append("resource_id")
    if DEFAULT_ROLE not in body["allowed_roles"]:
        missing.append("requested_role")
    context = " ".join(redact(body.get("context", "")).split())
    if not context:
        missing.append("reason")
    if missing:
        return {"missing_fields": missing, "question": missing_question(missing)}
    reason = f"Нужен доступ на чтение ({DEFAULT_ROLE}) к {resource_id}. Задача: {context}"
    return access_parameters(resource_id, reason)


def missing_question(missing: list[str]) -> str:
    if "resource_id" in missing:
        return "К этому ресурсу нельзя запросить доступ. Уточните у buddy, какой ресурс нужен."
    if "requested_role" in missing:
        return "Для этого ресурса нет доступной роли. Уточните у buddy, какая роль нужна."
    return "Для какой задачи нужен доступ? Опишите её одним-двумя предложениями."


def propose_access_request(request: dict) -> dict | None:
    """tool.proposed для /generate или None, если заявку сейчас предлагать нельзя."""
    goal_context = request.get("goal_context")
    if goal_context is None:
        return None
    if "create_access_request" not in request["allowed_tools"]:
        return None
    if "create_access_request" not in goal_context["next_actions"]:
        return None
    resource_id = goal_context["resource_id"]
    if not can_request(request["access_scope"], resource_id):
        return None
    for result in request["action_results"]:
        if result["type"] == "create_access_request" and result["status"] in ACTIVE_ACTION_STATUSES:
            return None
    step_id = goal_context["current_step_id"]
    return {
        "run_id": request["run_id"],
        "type": "create_access_request",
        "parameters": access_parameters(resource_id, template_reason(resource_id, step_id)),
        "goal_id": goal_context["goal_id"],
        "step_id": step_id,
    }
