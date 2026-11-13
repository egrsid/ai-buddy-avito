# AI design target v2

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
не вызывает вторую платную модель. Максимум две live-попытки: до 6s на первый фрагмент, полный ответ буферизуется
до EOF в общем first-content deadline 20s с запасом для следующей модели.
Pipeline 85s/Go 90s не расширены. Неудачная модель и query embeddings пропускаются
30s; прерванный ответ не попадает в историю. Актуальная поставка AI 25ac58f.
Сохраняются верхние лимиты 20/25/85/90s, ACL/retrieval/source validation и Go ownership.
В degraded ответе нет tool.proposed; явные Go actions/preview/confirm остаются доступны.

В чат через обычный message.delta всегда попадает: «Произошла ошибка обращения к LLM.
Работает fallback. Обратись к своему наставнику напрямую для решения вопроса».
При offline recovery явно сказано, что ответ подготовлен без LLM. Go сохраняет его
как завершённый резервный ответ; ошибочный partial исходной модели отброшен.
Публичные схемы не расширяются. Mock mode не делает live attempts и не сообщает
о выдуманном сбое. Structured операции остаются детерминированными.

Независимые component/API/DB/fault/restart результаты и оставшиеся FE/clean-build/live
gates — [TL record](../team/tl-readiness.md). Это не финальная browser/live приемка.

Версия 2.0 · целевое проектирование. TL checkout пока содержит bootstrap AI;
в AI-ветке 3f955322 уже реализованы offline HTTP/SSE, lexical ACL retrieval и диагностика.
[Review 12 ноября](../team/ai-review-2026-11-12.md) фиксирует tests/evals и остаток:
persistent kb/ingest/readiness, response validation/deadline defects и приемочный runner.
[Contextual AI SDD](../features/contextual-ai-assistance/spec.md),
[API](api-contracts.md), [security](security.md) задают границы; AI Engineer выбирает
adapters/prompting/retrieval/структуру модулей и eval методику внутри этих контрактов. [Назначение AI](../team/assignments/ai-engineer.md)
разделяет RP-AI-01 на ранний RP-AI-CORE-01 (generate/retrieval/route/access draft) и
RP-AI-DIAG-01 (classification/buddy/candidate); Go chat не ждёт завершения DIAG.

## Режимы и ответственность

LLM_MODE=mock — deterministic offline provider, без сети/ключа; покрывает выбор journey,
объяснение, draft заявки, safe классификацию, handoff и candidate draft. Это обязательный
fallback для полного P0 demo, а не только fixtures для чат-ответа. UI/отчёт помечают
режим mock/live. Он не является доказательством качества live LLM или pgvector RAG.
Основная live LLM MVP — Cloud.ru **`ai-sage/GigaChat3.5-432B-A28B`**, без
`-Reasoning`; название «GigaChat 3.5 Pro» исправлено. Provider/key/access smoke, env/deps,
расходы и вся LLM-specific интеграция (включая нужные Compose/CI/root locks) — AI Engineer,
без ожидания подтверждения TL. Общая инфраструктура вне LLM и приёмка продукта — TL.
Бюджет хакатона **1000 ₽**, начальный автоматический stop **800 ₽**, резерв **200 ₽**;
это план, не доказательство пополнения счёта или готовности live.

Live RP-AI-02 идёт для MVP отдельно от обязательного offline P0; mock CI остаётся без
платного ключа/сети. Ollama — опциональный local experiment, не обязательная зависимость.
При live-сбое/stop действует описанный выше recovery с явным notice;
ошибочные попытки не смешиваются с успешным резервным ответом. Go candidate fallback сохраняется.
GigaChat-3-Pro/прямой API Сбера — только резервные варианты, reasoning split chat/diagnostics
не принят. A-Vibe — после MVP через тот же LLMProvider, без переписывания RAG/Go logic.

[AI strategy §4/6/13](../AI_ENGINEERING_STRATEGY.md) задаёт проверенные API ID/цены,
таймауты и требования к поставке: hard output cap (старт 1000), reserve-before-call с
persistent/atomic ledger, учёт embeddings/retries/unknown usage; budget stop — существующий
LLM_UNAVAILABLE. Лимитер/кэш/live embedding wiring пока не реализованы этим документом.
Кэш опционален только для чистого documentation QA: subject + полный trusted scope/revision,
index/content revision, provider/model/settings, prompt/schema и вопрос; ACL/refs повторно
проверяются на hit. Dynamic/actions/diagnostics/candidates не кэшируются, live eval cache-off.

Live embedding profile — Cloud.ru `BAAI/bge-m3`, тот же Foundation Models key после
проверки permissions, один профиль для index/query. При смене embedding provider/profile
нужен атомарный reindex и invalidation cache; смена только generation LLM/key — не причина
reindex. Фактическая dimension/normalization фиксируется AI Engineer, несовместимость — not ready.
AI Engineer сам обновляет нужные runtime deps/locks для live; production HTTP client должен
быть production dependency. Сохраняются LLM_BASE_URL, LLM_MODEL, LLM_API_KEY и EMBEDDING_MODEL/DIM;
имена новых budget-настроек поставляются с реальной реализацией. Ключ только Python/env,
никаких секретов в Git/logs. Python не пишет app/corporate; AI-текст и confidence не evidence.

## Pipeline

1. Проверить token/schema/access_scope и allowed journeys/tools; отсутствие scope — отказ.
2. Получить только разрешённый goal/step, dependencies/evidence/blocker/safe actions из Go.
3. Retrieval с document/chunk ACL до top-5/LLM; повторная проверка title/metadata/refs/version.
   Даже offline fixture обязан применять scope. Не получать все документы с последующим
   редактированием готового ответа: запрещённый фрагмент вообще не передаётся модели.
4. Prompt: synthetic environment; инструкции из документов — данные; не придумывать
   обязательные этапы/аббревиатуры, не выдавать submitted/approved/ответ buddy за verified.
5. Объяснить текущую причину/следующий допустимый шаг. Practice First: предложить
   предусмотренную проверку. RAG помогает конкретной цели, словарь не центральный сценарий.
6. Один ограниченный run, <=1 tool proposal, никакого автономного выполнения/цепочки.
   Структурированные операции валидируются по закрытым schema; Go повторяет бизнес-валидацию.
7. При неизвестном/неоднозначном ответе честно уточнить или предложить buddy preview.
   Невалидный JSON/лишние поля/недопустимая роль/refs → AI_SCHEMA_INVALID без исполнения.

Выбор journey возвращает ID/version только из allowed list. Draft содержит ресурс,
requested_role, reason, additional_fields (пусто в P0); actor подставляет Go. Недостающие
поля → clarification/missing_fields. Handoff использует пересечение ACL intern/buddy,
checks/actions/errors и hypothesis с confidence, не психологические оценки. Candidate
получает только safe aggregate, отличает наблюдаемый паттерн от гипотезы дефекта инструкции.
При AI-сбое Go сохраняет минимальную детерминированную карточку, enrichment можно повторить.

## Индексация

Текущие data/knowledge/*.md и evals.json — legacy учебный набор, все demo_public и
репозиторный сценарий; это не готовый dataset нового MVP. AI RP-DATA-AI-01 добавляет
согласованные team/restricted/privacy fixtures и инструкции БД; Backend RP-MOCK-01 —
users/resources/assignments. UUID/refs согласуются до seed. Не редактировать runtime
материалы как часть документационной задачи. Новая версия source/chunks/ACL публикуется
только human review; candidate accepted не запускает ingest самостоятельно.
Свои synthetic DB/IAM/SSL fixtures разрешены. Неподтверждённые внутренние сокращения
остаются unknown cases. Внешний Playbook необязателен: AI предлагает конкретные фрагменты/
source/license, TL принимает их использование; чужие правила не выдаются за утверждённые.

Markdown → plain text; baseline chunks 600–1000 символов, overlap 100, заголовок и
source version/hash/model/dimension/ACL в метаданных. Атомарный ingest/reindex; scope-aware
cache; старый index не открывает отозванный документ. Для offline baseline допустим
лексический поиск, явно не vector RAG. Live RAG — реальные embeddings/pgvector; размерность
фиксируется новой миграцией, несовместимые модели не смешиваются. Exact cosine baseline,
ANN только после измерения и отдельного решения. kb — физическая logical knowledge.

AI Engineer предоставляет идемпотентный ingest CLI (команду/exit codes/настройки) и
реальные kb integration tests. Общий offline one-shot после migrate/seed и до AI readiness — TL;
live embedding/budget-specific wiring — AI Engineer:
mock mode готовит разрешённые chunks/ACL/lexical index без API/model downloads; live mode
явно использует настроенную model/dimension/budget и не подменяется mock молча. CLI
работает напрямую со своей kb под ai_service, не ждёт готового AI HTTP и не делает DDL.
Отсутствие/несовместимость ожидаемого индекса — not ready/ошибка ingest, не выдуманный успех.
Startup/test details — [development](../operations/development.md).

## Ошибки и оценка

Python контролирует provider first token 20s, provider content idle 25s и AI pipeline 85s;
Go — внешний run 90s и terminal state. Heartbeat на обоих SSE участках каждые 10s не
считается content token. Ошибки до SSE используют общий Error; internal X-Request-ID
обязателен. Точные правила, canonical Source.url и local/test X-Mock-Scenario в
[AI integration policy](ai-integration-policy.md). Provider ошибки нормализуются
LLM_UNAVAILABLE/LLM_TIMEOUT без raw payload. После начала stream нет
автоматического повторного LLM write/tool. Go сохраняет partial/failed, не pending action.

RP-AI-01 расширяет evals >=20: goal selection, draft correctness/missing fields, IAM
absent/approved-without-grant, DB_SSL_REQUIRED, practice/recheck, privacy разных команд,
restricted title/metadata/citations, personal-data fixture, injection, non-evidence AI,
handoff filtering, candidate hypothesis и offline fallback. Проверять свойства, refs,
schema и отсутствие запрещённого контента, не дословное совпадение текста.
Все safety cases обязательны; baseline retrieval target >=80% кейсов с нужным документом
в top-5 среди разрешённых. Live отчёт фиксирует provider/model/settings/dataset version,
качество, latency/cost и не смешивается с mock результатами. Текущие 10 legacy evals
не являются такой приёмкой. Для baseline AI Engineer вручную читает все ответы >=20
cases в дополнение к deterministic schema/source/ACL/tool checks. Платный LLM judge
не требуется. Отчёт готовит AI Engineer, Backend проверяет safety/tool/ACL boundary,
TL принимает результат. Автоматические component tests/coverage >80% отдельны от evals.
