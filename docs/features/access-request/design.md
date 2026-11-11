# Controlled DB Access Request — design

Целевое проектирование v2, implementation pending. [Поведение и приёмка](spec.md).

## Компоненты и поток

Go валидирует и сохраняет immutable action, выполняет с operation_key=action.id; mock владеет persistent request/grant, Go — app mirror и workflow. /approvals — минимальный экран уполномоченной роли. Poll 5s, без скрытой симуляции решения.

## Хранение и контракт

Action, AccessRequest, ResourcePolicy, mock request/decision/grant, operation_key, grant_state/sync_status.

POST /api/v2/actions create_access_request; /actions/{id}/confirm; GET /access-requests; GET /approvals; POST /access-requests/{id}/decision; resource IAM checks.

[Модель данных](../../architecture/data-model.md), [API](../../architecture/api-contracts.md),
[events](../../architecture/event-contracts.md), [states](../../architecture/state-machines.md)
задают общую семантику. Legacy JSON/DDL/seed не обновлены этой документационной задачей;
до реализации RP-CONTRACT-01 фиксирует executable schemas, RP-DATA-01 — новые миграции.

## Отказы, безопасность и UI

Missing fields/ROLE_NOT_REQUESTABLE; TTL/version/ACL conflict; timeout/crash → unknown и lookup по прежнему key, не новая заявка.

Переходы в app атомарны; межсервисный unknown сверяется по прежнему operation key.
[Security](../../architecture/security.md): deny by default, повторная проверка scope,
safe DTO/refs, без сырого provider/mock payload. UI использует [reference guidelines](../../design/UI_GUIDELINES.md),
состояния loading/error/empty/forbidden, версии и фактический результат Go. Цвет дополняется текстом.

## Проверка и зависимости

RP-AUTH-01, RP-JOURNEY-01, RP-MOCK-01, RP-AI-01, RP-CHAT-01. Negative tests и сценарии [spec](spec.md) обязательны;
команды/coverage/E2E в [testing](../../testing/strategy.md). Проверять через настоящий
Go/AI(mock)/corporate/DB путь; UI fixture не заменяет интеграцию.
