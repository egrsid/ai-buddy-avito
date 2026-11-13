# Authorization & Privacy — design

**Для новой разработки v3:** [Product/SDD](../../v3/README.md),
[границы и переход](../../v3/architecture.md), [задачи](../../v3/delivery.md).
Ниже сохранён baseline v2. Внутренний escalate_to_buddy/inbox/reply заменён Telegram;
добавлены versioned ТЗ и отдельные отчёты понятности, без изменения прав/verified.

Целевое проектирование v2, implementation pending. [Поведение и приёмка](spec.md).

## Компоненты и поток

Go policy module авторизует до queries/updates, формирует минимальный scope; Python retrieval adapter фильтрует chunk/document metadata до top-k и prompt. Source drawer заново проверяет ACL. Cache учитывает scope/revision. Никакого client-controlled scope.

## Хранение и контракт

User, RoleAssignment, Permission, ResourcePolicy, Session, document/chunk ACL, policy_revision.

POST /api/v2/auth/demo-login, GET /auth/me, POST /auth/logout; все public object routes и scoped internal knowledge API.

[Модель данных](../../architecture/data-model.md), [API](../../architecture/api-contracts.md),
[events](../../architecture/event-contracts.md), [states](../../architecture/state-machines.md)
задают общую семантику. Legacy JSON/DDL/seed не обновлены этой документационной задачей;
до реализации RP-CONTRACT-01 фиксирует executable schemas, RP-DATA-01 — новые миграции.

## Отказы, безопасность и UI

401 без сессии; 403 Origin/CSRF/role; одинаковый 404 для закрытого/отсутствующего объекта; stale ACL исключает старые citations.

Переходы в app атомарны; межсервисный unknown сверяется по прежнему operation key.
[Security](../../architecture/security.md): deny by default, повторная проверка scope,
safe DTO/refs, без сырого provider/mock payload. UI использует [reference guidelines](../../design/UI_GUIDELINES.md),
состояния loading/error/empty/forbidden, версии и фактический результат Go. Цвет дополняется текстом.

## Проверка и зависимости

RP-CONTRACT-01, RP-DATA-01; security tests готовятся от контракта. Negative tests и сценарии [spec](spec.md) обязательны;
команды/coverage/E2E в [testing](../../testing/strategy.md). Проверять через настоящий
Go/AI(mock)/corporate/DB путь; UI fixture не заменяет интеграцию.
