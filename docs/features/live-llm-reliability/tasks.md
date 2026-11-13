# Реальные ответы LLM и управляемый fallback — tasks v3

**Факт 13.11 (ветка feature/backend-v3):** Сделано: AI шлёт `response.origin`, Go сохраняет его в `messages.origin` и отдаёт в SSE `message.origin` и `GET /api/v3/conversations/{id}/message-origins` (V3-LLM-OBS-01, часть BE/AI). Открыто: FE-метка из этого поля вместо поиска по тексту, fault-прогоны V3-T21…T24. API: [backend-api](../../v3/backend-api.md).

V3-LLM-DIAG-01, V3-LLM-LIVE-01, V3-LLM-OBS-01 — TODO. [Owner/dependencies/allowed directories/DoD](../../v3/delivery.md).

- [ ] Согласовать DTO/semantic fixtures и consumer review в V3-CONTRACT-01.
- [ ] Реализовать spec в рамках следующей компонентной задачи, не этого docs-прохода.
- [ ] Проверить V3-T19…T24, negative ACL/version/error cases и component coverage >80%.
- [ ] Предъявить фактические результаты, отделив план от работающей функции.

[Spec](spec.md), [design](design.md).
