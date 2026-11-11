# Contextual AI Assistance — design

Целевое проектирование v2, implementation pending. [Поведение и приёмка](spec.md).

## Компоненты и поток

AI Engineer владеет provider adapter, prompting/retrieval/evals, Go — run/history/actions. Python → Go → React SSE; Go буферизует tool.proposed до generation.completed/commit. Separate general и goal/step conversations; no autonomous tools.

## Хранение и контракт

Conversation/Message/Run, Source, access_scope, goal_context, structured drafts/classification/summaries.

POST /api/v2/conversations/{id}/runs; GET /runs/{id}/events; internal /generate, /journey-selection, /access-request-draft, /classify-error, /diagnostic-summary, /knowledge-gap-draft.

[Модель данных](../../architecture/data-model.md), [API](../../architecture/api-contracts.md),
[events](../../architecture/event-contracts.md), [states](../../architecture/state-machines.md)
задают общую семантику. Legacy JSON/DDL/seed не обновлены этой документационной задачей;
до реализации RP-CONTRACT-01 фиксирует executable schemas, RP-DATA-01 — новые миграции.

## Отказы, безопасность и UI

AI_SCHEMA_INVALID/TOOL_VALIDATION_ERROR без pending action; LLM_TIMEOUT/UNAVAILABLE; SSE disconnect → interrupted и REST recovery.

Переходы в app атомарны; межсервисный unknown сверяется по прежнему operation key.
[Security](../../architecture/security.md): deny by default, повторная проверка scope,
safe DTO/refs, без сырого provider/mock payload. UI использует [reference guidelines](../../design/UI_GUIDELINES.md),
состояния loading/error/empty/forbidden, версии и фактический результат Go. Цвет дополняется текстом.

## Проверка и зависимости

RP-CONTRACT-01, RP-AUTH-01, RP-JOURNEY-01; live только RP-AI-02. Negative tests и сценарии [spec](spec.md) обязательны;
команды/coverage/E2E в [testing](../../testing/strategy.md). Проверять через настоящий
Go/AI(mock)/corporate/DB путь; UI fixture не заменяет интеграцию.
