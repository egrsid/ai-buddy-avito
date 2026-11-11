# Authorization & Privacy — specification

Версия 2.0 · P0 · статус: спроектировано, не реализовано.
Владельцы: Backend + AI. Backlog: RP-AUTH-01, RP-AI-CORE-01, RP-QA-01.

## Проблема и сценарий

Стажёры разных команд и ответственные сотрудники не должны получать чужие документы, метаданные, персональные данные или полномочия через AI.

Предусловия: Согласованы роли/assignments, synthetic policies и закрытые fixtures; local/test mode.

Пользователь входит → Go вычисляет scope → фильтрует объекты → Python применяет ACL до retrieval/LLM → Go проверяет sources → при каждой мутации права проверяются повторно.

## Бизнес-правила и данные

Deny by default; role недостаточно без team/resource/document/ownership. Buddy видит только переданный snapshot, approver только назначенный ресурс, docs-owner только scoped aggregate. UI не источник прав.

Данные: User, RoleAssignment, Permission, ResourcePolicy, Session, document/chunk ACL, policy_revision.

## API, состояния и ошибки

POST /api/v2/auth/demo-login, GET /auth/me, POST /auth/logout; все public object routes и scoped internal knowledge API.

Сессия active/expired/revoked; policy revision инвалидирует старый scope; невалидный scope → fail closed.

Ошибки: 401 без сессии; 403 Origin/CSRF/role; одинаковый 404 для закрытого/отсутствующего объекта; stale ACL исключает старые citations.

## Безопасность

Обязательны [security](../../architecture/security.md) и серверная авторизация каждого
объекта/действия; только synthetic данные. Go владеет бизнес-состоянием, Python только
предлагает. Закрытые документы/metadata не попадают в LLM, логи, агрегаты и чужие snapshot.

## Критерии приёмки

- [ ] intern-c не получает документы/названия/цитаты команды A; intern-a не получает restricted или personal-data fixture.
- [ ] Prompt injection не расширяет tools/permissions и не передаёт запрещённые chunks LLM; проверяется сам provider input.
- [ ] Buddy/approver/docs-owner без assignment получают отказ; self-approval и недопустимая requested_role запрещены.
- [ ] Origin, CSRF, expiry/logout и подмена actor/role/scope проверены сервером; повторный вход не сохраняет старые права.
- [ ] Релевантные component/integration проверки и coverage >80% выполнены; health/fixtures не считаются фичей.

## Зависимости и границы

RP-CONTRACT-01, RP-DATA-01; security tests готовятся от контракта.
[Design](design.md), [tasks](tasks.md), [backlog](../../team/backlog.md).
P1/P2 не добавлять к обязательной реализации без решения TL; общий scope в [Product Spec](../../product/specification.md).

## Ручная проверка после реализации

После реализации войти intern-a, запросить источник команды B и restricted; проверить 404 и отсутствие данных в captured provider input. Проверить logout/CSRF и approver без resource assignment.
