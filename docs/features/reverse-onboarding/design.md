# Reverse Onboarding — design

Целевое проектирование v2, implementation pending. [Поведение и приёмка](spec.md).

## Компоненты и поток

Go детерминированно считает contributions и резервирует candidate unique group key в транзакции. Python получает только safe aggregate, enrich обновляет существующую карточку. P0 journey team/resource scoped, versions сохраняются без изменения трёхчастного ключа; новая cross-version политика требует TL.

## Хранение и контракт

FrictionEvent, CandidateContribution (внутренний distinct), KnowledgeGapCandidate, Review, resolved_reference.

GET /api/v2/friction-groups, /knowledge-gaps[/{id}]; POST /knowledge-gaps/{id}/review; internal /knowledge-gap-draft; создание candidate только Go pipeline.

[Модель данных](../../architecture/data-model.md), [API](../../architecture/api-contracts.md),
[events](../../architecture/event-contracts.md), [states](../../architecture/state-machines.md)
задают общую семантику. Legacy JSON/DDL/seed не обновлены этой документационной задачей;
до реализации RP-CONTRACT-01 фиксирует executable schemas, RP-DATA-01 — новые миграции.

## Отказы, безопасность и UI

Concurrent threshold/duplicate event не дублируют candidate; AI unavailable → safe deterministic card; wrong scope 404/403; stale review version 409.

Переходы в app атомарны; межсервисный unknown сверяется по прежнему operation key.
[Security](../../architecture/security.md): deny by default, повторная проверка scope,
safe DTO/refs, без сырого provider/mock payload. UI использует [reference guidelines](../../design/UI_GUIDELINES.md),
состояния loading/error/empty/forbidden, версии и фактический результат Go. Цвет дополняется текстом.

## Проверка и зависимости

RP-BLOCKER-01, RP-AUTH-01; synthetic intern-a/intern-b из RP-MOCK-01. Negative tests и сценарии [spec](spec.md) обязательны;
команды/coverage/E2E в [testing](../../testing/strategy.md). Проверять через настоящий
Go/AI(mock)/corporate/DB путь; UI fixture не заменяет интеграцию.
