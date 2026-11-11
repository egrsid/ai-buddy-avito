# Buddy Debug Bridge — design

Целевое проектирование v2, implementation pending. [Поведение и приёмка](spec.md).

## Компоненты и поток

Go берёт buddy из assignment, строит safe intersection snapshot и фиксирует exact immutable action. App transaction создаёт escalation/связь blocker. UI /buddy/escalations[/{id}] и результат у intern; poll 5s. Минимальная кнопка «Ответить и закрыть».

## Хранение и контракт

Action escalate_to_buddy, Escalation, diagnostic_snapshot, blocker_id, answer/resolved_at, version.

POST /api/v2/actions и /confirm; GET /escalations[/{id}]; POST /escalations/{id}/reply; internal /diagnostic-summary.

[Модель данных](../../architecture/data-model.md), [API](../../architecture/api-contracts.md),
[events](../../architecture/event-contracts.md), [states](../../architecture/state-machines.md)
задают общую семантику. Legacy JSON/DDL/seed не обновлены этой документационной задачей;
до реализации RP-CONTRACT-01 фиксирует executable schemas, RP-DATA-01 — новые миграции.

## Отказы, безопасность и UI

Нет назначенного buddy/изменение назначения/ACL требует нового preview; чужой объект 404; stale version/повтор другого ответа 409.

Переходы в app атомарны; межсервисный unknown сверяется по прежнему operation key.
[Security](../../architecture/security.md): deny by default, повторная проверка scope,
safe DTO/refs, без сырого provider/mock payload. UI использует [reference guidelines](../../design/UI_GUIDELINES.md),
состояния loading/error/empty/forbidden, версии и фактический результат Go. Цвет дополняется текстом.

## Проверка и зависимости

RP-AUTH-01, RP-BLOCKER-01, RP-CHAT-01. Negative tests и сценарии [spec](spec.md) обязательны;
команды/coverage/E2E в [testing](../../testing/strategy.md). Проверять через настоящий
Go/AI(mock)/corporate/DB путь; UI fixture не заменяет интеграцию.
