# Назначение: AI Engineer

## Следующая работа — v3

Ваши задачи: V3-CONTRACT-AI-01, V3-AI-01. Читать [Product/SDD](../../v3/README.md),
[единый handoff и зависимости](../../v3/delivery.md), [acceptance](../../v3/testing.md).
Общая база main b6f940d + принятая документация docs/v3-planning. Новые v3 branches пока
не созданы. Старые задания ниже относятся к v2; не возобновлять internal buddy workflow.
В текущем поручении разрешено только проектирование/документация, runtime tasks TODO.


## Текущая передача · 13 ноября

Runtime aa6ff38, persistent kb/ingest/readiness и budget/live adapters уже сведены в TL.
Здесь же реализованы exact-source excerpts и цепочка Pro → 3.5 → offline с chat notice
и предложением напрямую обратиться к наставнику. Переносить только AI-owned delta из TL
поверх своей поставки, сохраняя текущую работу. Не начинать заново AI-R1–R4.
[Изменения/проверки/фактический остаток](../tl-readiness.md),
[новая policy](../../architecture/ai-design.md).

Остаток RP-AI-02: повтор live safety обеих моделей (у 3.5 сейчас 9/10), actual tariffs/
account access/latency/cost, проверка failover с реальным endpoint. В этом проходе paid
calls не выполнялись. Offline API/DB/fault tests не заменяют live quality acceptance.
Прежнее назначение ниже читается с этими уточнениями.



Рабочая ветка **feature/ai-mvp-v2 существует на GitHub**. Проверенный head и
состояние — в [inventory](../branches.md). Текущие TL решения/границы/приемка:
[TL record](../tl-readiness.md). Первая contract поставка уже предъявлена; остаток
consumer gate и дальнейшие RP-задачи сохраняются. Чужие ветки/каталоги не менять.

## Начать с RP-CONTRACT-AI-01

**Текущая работа после push 3f955322:** CORE/DIAG и corpus уже частично поставлены,
не начинать их заново. [Review AI-R1–R4](../ai-review-2026-11-12.md) фиксирует независимые
184 tests/99.90%, 29 evals и конкретные дефекты. Следующая поставка: persistent kb,
ingest/readiness/DB commands; response schema bounds и deadlines; eval failure gate,
полный ручной review. Параллельно передать имеющийся internal API Go и подтвердить
document UUID/ACL вместе с Backend. Ни parent, ни CORE/DIAG/DATA пока не DONE.

Разделы ниже сохраняют исходный scope/порядок, а не утверждают отсутствие готовых модулей.

AGENTS/Before starting, [TL baseline](../../architecture/contract-baseline.md),
[API](../../architecture/api-contracts.md), [security](../../architecture/security.md),
[AI design](../../architecture/ai-design.md), [contract handoff](../contract-handoff.md),
[принятые TL уточнения](../../architecture/ai-integration-policy.md). Error/ID, timers,
heartbeat/fault header и Source.url там определены; их не нужно выбирать заново.

Сделать contracts/v2/ai.schema.json, AI positive/negative fixtures и свой contract test.
Описать generate input/output/SSE, journey selection/clarification, access draft/missing fields,
classify-error, diagnostic-summary, knowledge-gap-draft, scoped knowledge/search.
Common AccessScope/Source/IDs/States — из BE common schema, не дублировать свой набор.
Не ждать реализации Go: shared fields уже заданы TL, общие refinements согласуются с BE.

AI Engineer сам выбирает prompting/provider adapter/retrieval/module layout внутри
контрактов; TL не диктует framework. Reviewer Backend сверяет producer/consumer совместимость,
TL — security границы. До общего contract gate runtime DTO не закрепляются автономно.

## Очередь реализации

| ID | Вход | Результат |
|---|---|---|
| RP-DATA-AI-01 | Contract gate | Kb ACL migrations, synthetic team/restricted/PII knowledge fixtures, версии/IDs с Backend; физическая schema kb сохраняется |
| RP-AI-CORE-01 | Contract gate + DATA-AI | Offline generate/retrieval/route/draft, internal Error/ID/таймеры/faults/SSE; предоставить idempotent ingest CLI и реальные kb integration tests TL |
| RP-AI-DIAG-01 | AI CORE | Error classification, safe buddy summary, candidate hypothesis/fix, invalid/unavailable fixtures; весь набор >=20 evals |
| RP-AI-02 | Live MVP; доступ/оплата, smoke сейчас, полная приёмка после RP-AI-01 | Вся LLM-specific интеграция и расходы самостоятельно без approval TL; модель/бюджет/guard/cache/embeddings и tests по уточнению ниже |

RP-AI-01 — milestone CORE+DIAG, не блокировать ранний chat/access до всего diagnostic
пакета. DIAG работает по согласованным fixtures, не ждёт готового Go blocker/candidate
endpoint; реальную интеграцию потом проверяют оба владельца. Это снимает цикл ожидания.

## Владение и приёмка

ai-service/, ai-service/migrations/, data/knowledge/, AI schema/examples/invalid/tests.
App/corporate/users/grants/seed и business state принадлежат Backend/Go; общие scripts — TL.
Python не выставляет verified, не меняет route/permissions, не вызывает corporate mutations.
Модель видит только разрешённые fragments/titles/metadata: provider-input spy и revoked ACL
негативные проверки обязательны. Hypothesis/confidence не evidence; handoff без сырого чата/
секретов; candidate input — safe aggregate без IDs людей. Все structured outputs валидируются.

AI поставляет TL команды/exit codes ingest и DB integration tests для общей offline infra.
LLM-specific env/runtime dependencies/locks/Compose/CI wiring выполняет AI Engineer сам;
общее DB/UTF-8/orchestration wiring остаётся у TL. Для небольшого
набора evals AI читает все ответы вручную вместе с deterministic assertions; Backend
проверяет safety/tool границы, TL принимает отчёт, paid LLM judge не обязателен.

make check, AI component checks/coverage >80%, >=20 evals и all safety pass; offline path
не вызывает сеть/не требует key. Lexical mock не выдаётся за live pgvector. Report model/mode/
dataset/quality/cost отдельно от coverage. Backend получает fixtures/совместимые DTO,
TL — команды, результат, ограничения. Никакого внешнего LLM key в Git/logs/fixtures.


## Ответ TL на вопросы о стратегии · 12 ноября

[AI Engineering Strategy](../../AI_ENGINEERING_STRATEGY.md) исправлена по
[Product Spec](../../product/specification.md). S3 — тестовая БД, `DB_SSL_REQUIRED`,
отдельный approver, IAM grant recheck и trusted DB check. Обязательное продолжение —
friction двух distinct intern, один Knowledge Gap Candidate и review documentation_owner;
accepted не публикует документ. Репозиторный сценарий не заменяет этот P0.

Cloud.ru подключается через адаптер `openai`; модель **ai-sage/GigaChat3.5-432B-A28B**
без `-Reasoning`, не «3.5 Pro». **Ключ, окружение, оплата и вся LLM-specific интеграция —
AI Engineer, без ожидания подтверждения TL.** Общие файлы разрешены только в этой области
по [working agreements](../working-agreements.md); Go/React business logic остаётся у авторов.
Бюджет хакатона 1000 ₽, автоматический stop 800 ₽, резерв 200 ₽; это план, не оплаченный счёт.

Следующая live-поставка RP-AI-02 по [strategy §4/6/7/13](../../AI_ENGINEERING_STRATEGY.md):

- До платных вызовов durable budget ledger с atomic reserve/settle, блокировкой всех workers,
  persistent volume, учётом retries/embeddings/unknown usage; hard output cap (старт 1000).
  Stop/corrupt ledger/неизвестная верхняя цена → LLM_UNAVAILABLE до provider call.
- Первые 5–10 замеров внутри примерно 10 smoke: доступ ID, usage/billing, TTFT <=20s,
  streaming/cancel/schema/tools. Не увеличивать 20/25/85/90s таймеры и не добавлять Reasoning
  диагностику автоматически. Unknown usage остаётся зарезервированным, timeout не бесплатен.
- Live BAAI/bge-m3 тем же разрешённым key, один index/query embedding profile; изменение
  embedding provider/profile → reindex/not-ready/cache invalidation. Generation/key смена
  сама по себе reindex не требует. Dimension измерить, новый DDL — только миграцией владельца.
- Cache — опционально после budget/safety, только чистый documentation QA, subject/full
  scope/revision/index/model/prompt/schema/question и повторная ACL/ref validation на hit.
  Никаких dynamic goal/checks/actions/diagnostics/candidates; cache-off live eval.
- Prompt/fixture отладка — deterministic offline, Ollama по желанию; CI/организаторам она
  не требуется. Платные расходы: smoke, 2–3 ограниченных eval-прогона, embeddings, demo.
- Budget concurrency/restart/duplicate settlement/unknown usage/corrupt ledger, cache revoke/
  isolation/source revision и reindex tests + report usage/cost/TTFT/лимиты/ETA/блокеры.

Прямой API Сбера и GigaChat-3-Pro — только запасные варианты, новый адаптер сейчас не нужен.
A-Vibe — после MVP. Live и offline отчёты отдельны; AI-R1–R4 и остальные integration gates
этим документом не закрываются, guard/cache/live RAG не считаются уже реализованными.

## Дополнение к v3 очереди

V3-LLM-DIAG-01 первым: mock launch отличить от provider outage; V3-LLM-LIVE-01 и OBS-01, actual primary smoke после настройки guard, не скрывать fallback.
Общие зависимости/каталоги/DoD — [delivery](../../v3/delivery.md), [матрица](../../v3/testing.md).
Текущий проход остаётся docs-only; эти runtime задачи TODO.
