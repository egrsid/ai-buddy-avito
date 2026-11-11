# Contextual AI Assistance — specification

Версия 2.0 · P0 · статус: спроектировано, не реализовано.
Владельцы: AI Engineer + Backend + Frontend. Backlog: RP-AI-01, RP-CHAT-01, RP-FE-02.

## Проблема и сценарий

Стажёр вынужден заново пересказывать цель и проверки; свободная генерация инструкций может обойти обязательные шаги.

Предусловия: Go передал разрешённый goal/step, scope, evidence/blockers, allowed_journeys/tools; offline provider доступен.

Intern спрашивает в контексте шага → scoped retrieval → объяснение причины/следующего безопасного действия → структурированный draft/proposal → Go validation → preview, без исполнения Python.

## Бизнес-правила и данные

RAG поддерживает цель; термины вторичны. AI не придумывает обязательные этапы, роли или результат. <=1 proposal/run, structured schemas, unknown/ambiguous → clarification/buddy. Practice First на mock DB check.

Данные: Conversation/Message/Run, Source, access_scope, goal_context, structured drafts/classification/summaries.

## API, состояния и ошибки

POST /api/v2/conversations/{id}/runs; GET /runs/{id}/events; internal /generate, /journey-selection, /access-request-draft, /classify-error, /diagnostic-summary, /knowledge-gap-draft.

Run queued/running/completed/failed/cancelled/interrupted; partial не означает completed, action только после успешной валидации.

Ошибки: AI_SCHEMA_INVALID/TOOL_VALIDATION_ERROR без pending action; LLM_TIMEOUT/UNAVAILABLE; SSE disconnect → interrupted и REST recovery.

## Безопасность

Обязательны [security](../../architecture/security.md) и серверная авторизация каждого
объекта/действия; только synthetic данные. Go владеет бизнес-состоянием, Python только
предлагает. Закрытые документы/metadata не попадают в LLM, логи, агрегаты и чужие snapshot.

## Критерии приёмки

- [ ] AI получает текущие разрешённые goal/step/checks, не чужую историю; sources реально существуют и доступны.
- [ ] Draft, classification, handoff и candidate соответствуют schema; попытка изменить state/permission запрещена.
- [ ] SSE/cancel/retry не дублируют message/action; после refresh сохранённый результат совпадает.
- [ ] Полный offline P0 без сети/ключа; mock/live обозначены; safety evals и schema-invalid fixtures проходят.
- [ ] Релевантные component/integration проверки и coverage >80% выполнены; health/fixtures не считаются фичей.

## Зависимости и границы

RP-CONTRACT-01, RP-AUTH-01, RP-JOURNEY-01; live только RP-AI-02.
[Design](design.md), [tasks](tasks.md), [backlog](../../team/backlog.md).
P1/P2 не добавлять к обязательной реализации без решения TL; общий scope в [Product Spec](../../product/specification.md).

## Ручная проверка после реализации

После реализации спросить о DB_SSL_REQUIRED в check_connection. Проверить разрешённую инструкцию, безопасную проверку и preview. Оборвать SSE и восстановить run через REST без отправки заявки.
