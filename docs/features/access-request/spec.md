# Controlled DB Access Request — specification

Версия 2.0 · P0 · статус: спроектировано, не реализовано.
Владельцы: Backend + AI + Frontend + Fullstack/QA. Backlog: RP-ACCESS-01, RP-MOCK-02, RP-FE-02.

## Проблема и сценарий

Стажёр не знает нужную систему/поля; отправка заявки и одобрение часто ошибочно воспринимаются как фактический доступ.

Предусловия: Ресурс requestable по policy, IAM вернул absent, intern имеет право запрашивать разрешённую DB роль; scoped approver назначен.

AI draft → Go schema/policy validation → точный preview → confirm intern → same-key mock create → отдельный approver approve/reject → IAM recheck → только затем connection check.

## Бизнес-правила и данные

Actor только из сессии, requested_role из resource allowlist, additional_fields={} P0. Confirm означает только отправку. Нет auto-approval/15s timer. Approved без grant ожидает. Self-approval запрещён.

Данные: Action, AccessRequest, ResourcePolicy, mock request/decision/grant, operation_key, grant_state/sync_status.

## API, состояния и ошибки

POST /api/v2/actions create_access_request; /actions/{id}/confirm; GET /access-requests; GET /approvals; POST /access-requests/{id}/decision; resource IAM checks.

Action pending_confirmation/executing/succeeded/failed/unknown/cancelled/expired; request submitted/approved/rejected; grant absent/pending/present/unknown отдельно.

Ошибки: Missing fields/ROLE_NOT_REQUESTABLE; TTL/version/ACL conflict; timeout/crash → unknown и lookup по прежнему key, не новая заявка.

## Безопасность

Обязательны [security](../../architecture/security.md) и серверная авторизация каждого
объекта/действия; только synthetic данные. Go владеет бизнес-состоянием, Python только
предлагает. Закрытые документы/metadata не попадают в LLM, логи, агрегаты и чужие snapshot.

## Критерии приёмки

- [ ] Без полного валидного draft и exact confirm нет mock write; изменённый preview требует нового action.
- [ ] Повтор/concurrent confirm и crash-after-create создают один mock_id, reconcile восстанавливает результат.
- [ ] Только назначенный approver принимает решение; intern confirm и таймер не выдают grant.
- [ ] Approved-without-grant не запускает DB check; reject/unavailable/expired/unknown честно отображены, чужие заявки скрыты.
- [ ] Релевантные component/integration проверки и coverage >80% выполнены; health/fixtures не считаются фичей.

## Зависимости и границы

RP-AUTH-01, RP-JOURNEY-01, RP-MOCK-01, RP-AI-01, RP-CHAT-01.
[Design](design.md), [tasks](tasks.md), [backlog](../../team/backlog.md).
P1/P2 не добавлять к обязательной реализации без решения TL; общий scope в [Product Spec](../../product/specification.md).

## Ручная проверка после реализации

После реализации intern-a подтверждает заявку дважды: один ID. Подождать — status остаётся submitted. approver-a одобряет, Go проверяет grant. Отключить mock после create и проверить same-key recovery.
