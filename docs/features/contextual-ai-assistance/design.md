# Contextual AI Assistance — design

**Для новой разработки v3:** [Product/SDD](../../v3/README.md),
[границы и переход](../../v3/architecture.md), [задачи](../../v3/delivery.md).
Ниже сохранён baseline v2. Внутренний escalate_to_buddy/inbox/reply заменён Telegram;
добавлены versioned ТЗ и отдельные отчёты понятности, без изменения прав/verified.

## Уточнение владельца · 13 ноября 2026

Текущее live-решение: `GigaChat/GigaChat-3-Pro` →
`ai-sage/GigaChat3.5-432B-A28B` → детерминированный offline provider.
Название «GigaChat3.5Pro» не является проверенным API ID; Pro ID подтверждён
уже поставленным AI smoke. [Каталог Cloud.ru](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models)
и фактические AI reports — разные виды evidence; доступ конкретного аккаунта проверяется отдельно.
Прежнее решение о единственной модели/только ручном offline retry заменено этим поручением.

В TL integration checkout это реализовано поверх существующего OpenAI adapter,
общего budget ledger и mock_answer. Primary — LLM_MODEL, secondary — LLM_FALLBACK_MODEL,
цены secondary задаются отдельно; unknown usage сохраняет резерв, budget refusal
не вызывает вторую платную модель. Максимум две попытки: 6s на первый кусок ответа,
ответ идёт в чат потоком сразу (первый кусок 0.5–1.1s вместо целого ответа через 3.7–6.3s).
Запасная модель вызывается, только если первая не прислала ни одного куска; оборванный после
начала ответ остаётся в истории с пометкой «Ответ модели прервался». UI по фиксированным фразам
показывает бейдж «Сгенерировано ИИ», «… · резервная модель» или «Fallback · без ИИ».
Упавшая модель и эмбеддинги пропускаются 30s (circuit breaker), затем пробуются снова.
Сохраняются верхние лимиты 20/25/85/90s, ACL/retrieval/source validation и Go ownership.
В degraded ответе нет tool.proposed; явные Go actions/preview/confirm остаются доступны.

В чат через обычный message.delta всегда попадает: «Произошла ошибка обращения к LLM.
Работает fallback. Обратись к своему наставнику напрямую для решения вопроса».
При offline recovery явно сказано, что ответ подготовлен без LLM. Go сохраняет его
как завершённый резервный ответ; ошибочный partial исходной модели отброшен.
Публичные схемы не расширяются. Mock mode не делает live attempts и не сообщает
о выдуманном сбое. Structured операции остаются детерминированными.

Независимые component/API/DB/fault/restart результаты и оставшиеся FE/clean-build/live
gates — [TL record](../../team/tl-readiness.md). Это не финальная browser/live приемка.

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

## Live cost/cache/embedding policy

AI Engineer владеет всей LLM-specific поставкой/расходами без approval TL; основная модель
ai-sage/GigaChat3.5-432B-A28B, embedding BAAI/bge-m3. [Strategy §13](../../AI_ENGINEERING_STRATEGY.md)
определяет 1000 ₽ budget/800 ₽ stop, durable locked reservation ledger и hard cap до paid call;
unknown usage/timeout не обнуляют резерв. Ledger не в app/corporate и не в Git; общий
persistent storage для всех участвующих AI workers. Код этой документацией не реализован.
QA cache ограничен stateless documentation answers, ключ subject/scope/revisions/index/
provider/model/settings/prompt/schema/question, повторная ACL/source validation при hit;
никаких динамических состояний/actions/handoff/candidates. Live eval cache-off.
Index/query используют один embedding profile; смена provider/profile → atomic reindex/
readiness/cache invalidation, смена generation/key при том же profile — без reindex.
Go business state/contracts и 20/25/85/90s timers сохраняются. A-Vibe после MVP.

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
