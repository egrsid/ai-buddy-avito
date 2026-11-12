# Causal Blockers & Friction Events — design

Целевое проектирование v2, implementation pending. [Поведение и приёмка](spec.md).

## Компоненты и поток

Go reducer атомарно записывает check/evidence/step/blocker/friction/event. Python классифицирует из allowlist только после safe normalization, не определяет прогресс. Recovery определяется template/policy, не свободной командой модели.

## Хранение и контракт

Blocker, FrictionEvent, VerificationCheck, allowed recovery_actions, safe_context; unique attempt/error.

GET /api/v2/goals/{id}/steps/{step_id} /actions; internal /classify-error; нет публичного trusted event ingest.

[Модель данных](../../architecture/data-model.md), [API](../../architecture/api-contracts.md),
[events](../../architecture/event-contracts.md), [states](../../architecture/state-machines.md)
задают общую семантику. Legacy JSON/DDL/seed не обновлены этой документационной задачей;
до реализации RP-CONTRACT-01 фиксирует executable schemas, RP-DATA-01 — новые миграции.

## Отказы, безопасность и UI

Unknown technical exception → safe code; invalid classification → deterministic explanation; повторное событие не дублирует friction.

Переходы в app атомарны; межсервисный unknown сверяется по прежнему operation key.
[Security](../../architecture/security.md): deny by default, повторная проверка scope,
safe DTO/refs, без сырого provider/mock payload. UI использует [reference guidelines](../../design/UI_GUIDELINES.md),
состояния loading/error/empty/forbidden, версии и фактический результат Go. Цвет дополняется текстом.

## Проверка и зависимости

RP-VERIFY-01; схемы из RP-CONTRACT-01. Negative tests и сценарии [spec](spec.md) обязательны;
команды/coverage/E2E в [testing](../../testing/strategy.md). Проверять через настоящий
Go/AI(mock)/corporate/DB путь; UI fixture не заменяет интеграцию.
