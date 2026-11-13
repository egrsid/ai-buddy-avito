"""Права на документы знаний (security.md, contract-baseline.md раздел 2).

Deny by default. Документ доступен, только если Go явно дал knowledge.read на него
в access_scope И документ проходит собственную ACL:
- public — достаточно явного разрешения;
- team — ещё и команда документа есть в team_ids;
- restricted — ещё и resource.view на ресурс документа;
- private (synthetic PII) — никогда: ни в поиск, ни в модель.
"""

from app.knowledge import Document


def permissions_for(entries: list[dict], key: str, value: str) -> list[str]:
    for entry in entries:
        if entry[key] == value:
            return entry["permissions"]
    return []


def can_read(scope: dict, document: Document) -> bool:
    if document.visibility == "private":
        return False
    granted = permissions_for(scope["document_permissions"], "document_id", document.id)
    if "knowledge.read" not in granted:
        return False
    if document.visibility == "public":
        return True
    if document.team_id not in scope["team_ids"]:
        return False
    if document.visibility == "team":
        return True
    resource = permissions_for(scope["resource_permissions"], "resource_id", document.resource_id)
    return "resource.view" in resource
