# Proof of Readiness — design

Целевое проектирование v2, implementation pending. [Поведение и приёмка](spec.md).

## Компоненты и поток

Go verification adapter проверяет source/correlation и сохраняет app результат транзакционно. Mock возвращает только safe status/code без содержимого БД. Step state не задаётся API-клиентом, evidence связывается с конкретной версией цели.

## Хранение и контракт

VerificationCheck, Evidence, StepProgress/Goal version, BusinessEvent, safe options ssl_mode.

POST /api/v2/goals/{id}/steps/{step_id}/checks; GET /checks/{id}; internal /iam/access-checks, /db/connection-checks.

[Модель данных](../../architecture/data-model.md), [API](../../architecture/api-contracts.md),
[events](../../architecture/event-contracts.md), [states](../../architecture/state-machines.md)
задают общую семантику. Legacy JSON/DDL/seed не обновлены этой документационной задачей;
до реализации RP-CONTRACT-01 фиксирует executable schemas, RP-DATA-01 — новые миграции.

## Отказы, безопасность и UI

ACCESS_DENIED, DB_SSL_REQUIRED, CHECK_UNAVAILABLE, version conflict, bad provenance/correlation; инфраструктурный сбой не заменяет результат на успех.

Переходы в app атомарны; межсервисный unknown сверяется по прежнему operation key.
[Security](../../architecture/security.md): deny by default, повторная проверка scope,
safe DTO/refs, без сырого provider/mock payload. UI использует [reference guidelines](../../design/UI_GUIDELINES.md),
состояния loading/error/empty/forbidden, версии и фактический результат Go. Цвет дополняется текстом.

## Проверка и зависимости

RP-JOURNEY-01, RP-ACCESS-01, RP-MOCK-02. Negative tests и сценарии [spec](spec.md) обязательны;
команды/coverage/E2E в [testing](../../testing/strategy.md). Проверять через настоящий
Go/AI(mock)/corporate/DB путь; UI fixture не заменяет интеграцию.
