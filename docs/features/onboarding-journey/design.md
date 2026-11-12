# Engineering Readiness Journey — design

Целевое проектирование v2, implementation pending. [Поведение и приёмка](spec.md).

## Компоненты и поток

Go загружает версионированный JSON и создаёт StepProgress; version/hash фиксируются на Goal. FE /onboarding и /onboarding/{goalId}/steps/{stepId} использует Query/Zod target DTO. Три обязательные проверки и recovery flow описаны в journey-template.md.

## Хранение и контракт

JourneyTemplate, Dependency, Goal, StepProgress, instruction_reference/version, evidence/blocker refs; статический template без runtime status.

GET /api/v2/journeys; POST/GET /goals; GET /goals/{id}/steps/{step_id} и /actions.

[Модель данных](../../architecture/data-model.md), [API](../../architecture/api-contracts.md),
[events](../../architecture/event-contracts.md), [states](../../architecture/state-machines.md)
задают общую семантику. Legacy JSON/DDL/seed не обновлены этой документационной задачей;
до реализации RP-CONTRACT-01 фиксирует executable schemas, RP-DATA-01 — новые миграции.

## Отказы, безопасность и UI

TEMPLATE_INVALID при цикле/unknown method/ref; 404 для чужой цели; 409 stale version; недоступный prerequisite не становится ready.

Переходы в app атомарны; межсервисный unknown сверяется по прежнему operation key.
[Security](../../architecture/security.md): deny by default, повторная проверка scope,
safe DTO/refs, без сырого provider/mock payload. UI использует [reference guidelines](../../design/UI_GUIDELINES.md),
состояния loading/error/empty/forbidden, версии и фактический результат Go. Цвет дополняется текстом.

## Проверка и зависимости

RP-CONTRACT-01, RP-DATA-01, RP-AUTH-01, RP-MOCK-01. Negative tests и сценарии [spec](spec.md) обязательны;
команды/coverage/E2E в [testing](../../testing/strategy.md). Проверять через настоящий
Go/AI(mock)/corporate/DB путь; UI fixture не заменяет интеграцию.
