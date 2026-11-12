# TL readiness и решения по интеграции

2026-11-12. Владелец поручил выполнить TL-часть в `feature/team-start-foundation`.
Дедлайн владельца: **2026-11-12 22:00 Europe/Moscow**. Это срок, не утверждение готовности.
Ни чужие ветки, ни refs, ни remote не изменены. Новая ветка не потребовалась; commit/push/PR нет.

**Повторный review после AI push:** текущая TL база уже fe870967 (прежние изменения
зафиксированы владельцем до этого прохода); новая AI поставка 3f955322 — семь commits.
[Актуальный review](ai-review-2026-11-12.md): 184 tests/99.90%, evals 29/29; runtime
не импортирован в TL. Ниже проверки bootstrap относятся к прежнему проходу; AI теперь
имеет offline HTTP/SSE/ACL/diagnostics в своей ветке, но остается без persistent kb,
ingest/DB tests/readiness и с открытыми AI-R2/R3/R4. Текущие правки — только документация.

## Проверенная поставка и происхождение

| Пакет | Проверенный commit GitHub | Что включено в TL checkout |
|---|---|---|
| Backend | 69fea38237068149a7aa07c840f98e1b280d5ca9 | Пять v2 schemas, examples/invalid, общий validator/tests; contract validation в check_repo |
| AI contracts | 0da47f66a30c3a5aad94ee0fe50a2bb059431e8d | ai.schema.json, AI examples/invalid и девять contract tests; не изменились в новой поставке |
| AI runtime | 3f955322eabd2874d5952e160ce1cf5c3898cb0d | Только read-only review/изолированные tests; не импортирован в TL checkout |
| Frontend | 676b81dd0cb1636a3b578459cd6404298f769335 | Изучен review/код; frontend в TL checkout не копируется и не исправляется за автора |
| QA | 1d47f6b2d58ded0eacd8e7588270b009663c9388 | Изучены legacy tests; QA-файлы не перезаписываются |

JSON-файлы BE/AI импортированы без изменения. `contracts/v2/BASELINE.sha256` фиксирует
состав и SHA-256 каждого JSON. `python -m scripts.contract_baseline` проверяет смешение
версий; `--write` обновляет lock после согласованной поставки, но не заменяет review.
Legacy v1 остается отдельным проверяемым пакетом, не runtime-совместимостью v2.

## Решения TL по frontend review 3.1–3.9

1. Расширенные BE fixtures принимаются для технической проверки. FE должен повторить
   consumer test на этой версии: в аудите 4/181 failures, не условное молчаливое approval.
2. Принимаются уточнения BE: cancelled без error_code; interrupted только с
   STREAM_NOT_OPENED/CLIENT_DISCONNECTED; completed с assistant_message_id. Пустого
   assistant Message нет; до первого токена остается только терминальный Run.
3. ResourceAccess до проверки: unknown, stale=true, observed_at отсутствует. После
   наблюдения время обязательно. Закрытый/неизвестный ресурс дает одинаковый 404.
4. Error.fields.name в P0 остается **верхнеуровневым именем поля**. Для вложенной ошибки
   options.ssl_mode передается name=options и safe code; dotted paths не добавляем.
5. Все list API возвращают {items:[...]}; GoalList содержит полные Goal со steps в P0.
6. Для GET /goals/{id}/steps/{step_id}/actions выбран {items: RecoveryAction[]} — тот же
   вычисленный allowlist, что Step.available_actions, без второго источника состояния.
   **Backend добавляет StepActionList/schema/example/invalid, FE binding.** До этой поставки
   endpoint не считается покрытым контрактом; TL не меняет авторскую schema за Backend.
7. Optional означает absent, не null. Nullable исключения: User.buddy_id и общий
   Conversation.goal_id/step_id. Backend добавляет negative fixtures для optional null,
   FE повторяет parsing. Go использует omitempty там, где null запрещен.
8. Три mandatory steps и blocker-context handoff — осознанные P0-ограничения. FE
   показывает Action.preview, а не самостоятельно собирает parameters в preview.
9. TTL вычисляет Go. Ответы создания/чтения Action имеют HTTP Date (серверное UTC-время).
   UI оценивает remaining от Date и времени получения; created_at не является текущими
   часами. Таймер UI справочный, право confirm окончательно проверяет сервер.

Это решения TL в ответ на конкретные вопросы потребителя. Авторы подтверждают их
соответствующими schemas/tests и записанным review, а не новым устным согласованием.
RP-CONTRACT-REVIEW-01: **IN_PROGRESS**. Техническая проверка предъявленных BE+AI schemas
выполнена, но final acceptance зависит от п. 6–7 и повторного FE/BE↔AI review.
Нельзя отмечать parent DONE до этих результатов. До gate доступны проектирование и
подготовка component tests; общие runtime DTO закрепляются после consumer acceptance.

## Реализованная TL инфраструктура

- Python production image включает contracts/ для offline refs; отдельный test target
  содержит dev dependencies. Непривилегированный app имеет writable coverage directories.
- compose.mvp.yaml — явный target overlay. Ingest ждет seed, AI ждет ingest и /readyz;
  отдельный ai-db-tests получает только ai_service DSN, mock LLM и пустой LLM_API_KEY.
- AI сам поставляет две команды как JSON argv arrays: AI_INGEST_COMMAND и
  AI_DB_TEST_COMMAND. scripts.ai_tasks запускает их без shell, сохраняет nonzero exit,
  запрещает admin DSN и unsafe fault config. Нет фиктивного ingest/test по умолчанию.
- make mvp-preflight/mvp-up/ai-db-test и opt-in workflow_dispatch mvp_acceptance
  подключены. Отсутствующие компоненты/CLI дают BLOCKED/nonzero; это не green MVP.
- CI compose проверяет v2 schemas в непривилегированном test image. Настоящий AI DB job
  включается явно после поставки команд/реализации, через repository vars с JSON argv.
- Общие seed/migrate/check reads и hashes используют explicit UTF-8; regression tests
  проверяют кириллицу/emoji/hash и неизменность migration checksum. Applied 001 не менялись.
- verify-db проверяет наличие seed IDs без требования, чтобы в БД было ровно 4 аккаунта;
  дополнительные записи не требуют reset. Сам seed/DDL остается legacy до поставки BE/AI.
- BACKEND_PORT/FRONTEND_PORT позволяют поднять отдельное окружение без захвата 8080/5173.

Общие manifests/locks не менялись: запроса минимальных production deps от AI пока нет.
После поставки v2 seed/table layout нужны точная адаптация seed/check/verify-db и реальный
повторный прогон; нельзя объявить RP-DATA-TL-01 завершенной на v1.

## Проверки и ограничения

Фактические проверки TL: clean bootstrap Compose в отдельном проекте
`ai-buddy-tl-20261111`, новые volume/network, порты 18080/15173; повтор migrate/seed дважды;
verify-db (seed IDs/role isolation); liveness smoke. Всё успешно на **legacy dataset**.
11 v2 contract tests прошли внутри собранного test image под app, без LLM/сети во время tests.
Локальный make check: 50 tests passed, lint/format/docs/schema checks passed.
make test на хосте остановился на отсутствии go; backend vet/build успешно выполнены отдельно
закрепленным Go 1.27.3 container (read-only source). AI/mock component checks — BOOTSTRAP,
не business coverage. Frontend TL checkout — bootstrap build, не remote FE prototype.
После настоящего restart PostgreSQL/backend verify-db снова прошел; это legacy persistence.

Это не новая auth/journey/IAM реализация, не full P0 E2E и не offline AI evaluation.
Прежние FE findings: build/171 tests pass, coverage 48.09%; текущие BE fixtures дают FE
4/181 failures. Чужие ветки не исправлялись, результаты не выдаются за актуальный FE pass.
MVP preflight ожидаемо BLOCKED: runtime v2/migrations/CLI/browser tests еще отсутствуют.

## Что не может быть принято без чужой поставки

| TL задача | Реальное состояние / необходимый вход |
|---|---|
| RP-CONTRACT-REVIEW-01 | TL решения/проверка готовы; нужны schema additions и consumer acknowledgements |
| RP-INF-01 | Bootstrap/image/config проверены; AI HTTP уже поставлен, но target ждет AI-R1: kb/ingest/readiness/DB tests |
| RP-DATA-TL-01 | UTF-8/runner foundation проверены; v2 seed/schema layout/IDs еще нужны от BE/AI |
| RP-INTEGRATION-01 | AI unit/coverage/evals проверены, AI-R1–R4 открыты; нужны BE/FE runtime и общий API/browser/security/restart отчет |
| RP-DEMO-01 | Нужен принятый работающий путь для честной репетиции/видео/PDF |
| RP-TL-02 | Срок 12 ноября 22:00 подтвержден владельцем; оригиналы требований/формат сдачи отсутствуют |

До получения оригиналов внутренний release gate — Product Spec/SDD/testing strategy:
offline local P0, четыре прикладные роли, >80% каждого компонента, A/B/C и negative tests.
Соответствие неизвестным правилам организаторов не утверждается. Ключ/бюджет обязательному
offline P0 не нужен; public hosting/второй journey/P1/P2 не добавляются в дедлайн.
Live LLM/embeddings RP-AI-02 уточнены последним поручением ниже как отдельная MVP-поставка
AI Engineer; их готовность не выводится из offline gate.
Публикация/доставка локального результата в рабочие ветки еще не выполнялась; чужие ветки
обновляет их автор/владелец по Git-контракту. Перед обновлением сверить текущие heads.

Изолированный проект после проверки остановлен командой compose down **без --volumes**;
его ai-buddy-tl-20261111_pgdata сохранен. Docker Desktop остается запущенным. Контейнеры
и volumes других проектов не менялись.


## Ответ на три вопроса AI Engineer о стратегии · 2026-11-12 · предыдущий проход

Локальное TL-решение по сообщению владельца; только документация в текущей ветке.

1. [AI Engineering Strategy](../AI_ENGINEERING_STRATEGY.md) приведена к
   [Product Spec](../product/specification.md): S3 — синтетическая тестовая БД,
   `DB_SSL_REQUIRED`, отдельные confirm/approval/grant recheck и trusted DB check.
   Отсутствующая AVITO_AI_BUDDY_PRODUCT_SPEC.md больше не является источником требований.
2. В scope, примеры, план и DoD стратегии добавлено обязательное продолжение:
   friction → два distinct intern → один Knowledge Gap Candidate → scoped human review.
   AI предлагает безопасную гипотезу; Go хранит/дедуплицирует/ведёт review, accepted не publish.
3. Cloud.ru остаётся подключением внутри OpenAI-совместимого адаптера openai после проверки
   AI Engineer; смена архитектуры не требуется. **AI Engineer сам ищет/получает ключ и
   model access, готовит окружение самой LLM и подключает провайдера.** Он передаёт ETA,
   блокеры, env/deps и фактические расходы. Уточнено следующим поручением владельца:
   расходы и вся LLM-specific интеграция переданы AI Engineer без approval TL; бюджет
   1000/stop 800 ₽. RP-AI-02 — live-поставка MVP отдельно от обязательного offline P0.
   Фактические ключ/пополнение счёта/live-готовность не подтверждены.

Продуктовая спецификация и Reverse Onboarding SDD уже содержали нужный P0 и не переписаны.
Код/контракты/DDL/seed/конфигурация не менялись. AI-R1–R4, FE/BE/QA/contract/integration
конфликты этой задачей не исправлялись и их приёмка не закрыта. Чужие ветки/refs не менялись;
commit/push/PR/merge/checkout не выполнялись. Исследовательские цены/модели не проверялись:
их проверка относится к AI Engineer в RP-AI-02, не к этой продуктовой правке.

Проверка этой правки: `UV_CACHE_DIR=/tmp/ai-buddy-uv-cache make check` — успешно,
**50 passed**, docs links/v1/v2/schema/SQL/YAML/lint/format пройдены.
`git diff --check` — успешно; изменены только 10 Markdown-файлов, refs/ветка сохранены.
Component/E2E/live API tests не запускались: код и поведение не менялись.


## Решение по предложениям AI Engineer: модель/бюджет/cache · 2026-11-12

[AI strategy](../AI_ENGINEERING_STRATEGY.md), policy/design, SDD, ownership/backlog,
operations и testing согласованы в текущей ветке; это требования, не runtime-поставка.

- Исправлено имя: `ai-sage/GigaChat3.5-432B-A28B` — официальный ID без `-Reasoning`.
  Предположение о скрытых reasoning-токенах/множителе 2–5 не относится автоматически к нему.
  Тариф каталога 96,22/288,60 ₽ даёт 0,77934 ₽ за 6000/700 tokens; вместимость бюджета
  теоретическая, actual usage/billing/TTFT проверяет AI Engineer.
- Бюджет 1000 ₽, начальный stop 800 ₽/резерв 200 ₽; AI обеспечивает расходы и всю
  LLM-specific интеграцию самостоятельно, без подтверждения TL. Общая offline/DB infra — TL.
- Limiter принят с reserve-before-call, atomic/durable ledger, shared lock/persistent volume,
  cap и tests concurrency/restart/retry/unknown usage. Это больше, чем log-cost counter;
  stop → LLM_UNAVAILABLE и явный offline retry. Реализация AI Engineer ещё требуется.
- 20/25/85/90s неизменны, первые 5–10 замеров входят в ~10 smoke; Ollama опциональна.
  Reasoning diagnostics/GigaChat-3-Pro auto routing не добавлены.
- QA cache опционален после guard/safety, только stateless documentation answers;
  subject/full scope/revisions/model/prompt/schema/question и ACL revalidation на hit.
  Dynamic/actions/diagnostics/candidates исключены, live eval cache-off.
- Live embeddings — Cloud.ru BAAI/bge-m3 одним разрешённым key и единым index/query profile;
  несовместимая смена provider/profile → reindex. Generation/key смена сама по себе — нет.
  A-Vibe после MVP; Сбер freemium — резерв без нового адаптера; условия/оплату своего
  Cloud.ru аккаунта проверяет AI Engineer, регистрация/покупка здесь не выполнялись.

S1–S4, DB_SSL_REQUIRED, evidence/approval/feedback/privacy сохранены. AI-R1–R4 и прочие
component/integration findings не закрыты. Новых документов, кода/схем/config/DDL нет;
чужие ветки/refs, commit/push/PR не затрагиваются. Проверки этого прохода — ниже.

Проверки текущего прохода: `UV_CACHE_DIR=/tmp/ai-buddy-uv-cache make check` — успешно,
**50 passed**, lint/format/docs/schema/SQL/YAML пройдены. `git diff --check` — успешно.
Дополнительно сверены 21 раздел стратегии, S1–S4/security/модель/budget policy и отсутствие
старых TL approval gates. По хэшам изменены только 16 существующих Markdown-файлов;
исполняемые файлы/config/contracts/DDL, Git refs/ветка и untracked inventory неизменны.
Новых документов/коммитов нет, live API/оплата/регистрация/component/E2E не выполнялись;
это не подтверждение реализации guard/cache или расхода средств.

## Локальная проверка bootstrap и QA API · 2026-11-13

- На Windows `core.autocrlf=true` переводил `scripts/bootstrap-db.sh` в CRLF. Хотя Dockerfile
  копировал файл с правом 755, Linux не мог разрешить `#!/bin/sh\r` и PostgreSQL выходил 127.
  В TL checkout добавлено правило `.gitattributes` `scripts/bootstrap-db.sh text eol=lf`;
  рабочий файл нормализован к LF.
- Собранный PostgreSQL image проверен на одноразовом контейнере без постоянного volume:
  bootstrap создал роли/схемы/extension, `pg_isready` вернул accepting connections.
- Для интеграционного запуска использована временная Compose override с Postgres build context
  из TL checkout и отдельный project `ai-buddy-api-test` с новой v2 БД. Все сервисы healthy;
  повторный `migrate` прошёл дважды, `seed` прошёл дважды без сброса прогресса, liveness
  smoke backend/frontend/AI/mock прошёл. Повторный `npx playwright test e2e/onboarding.spec.ts
  --reporter=line` против v2 API: **2 passed**. Это только два RP-QA-01 API сценария,
  не browser E2E/полный P0/restart.
- `verify-db` запущен, но падает на legacy ожидании `app.tasks`: активный v2 seed не содержит
  legacy task IDs, а `kb`-данные принадлежат AI. Это несоответствие verifier текущему v2 seed,
  не подтверждённый дефект сервиса. Отдельный read-only запрос подтвердил отсутствие SELECT
  через `app_service` в corporate/kb, `ai_service` в app/corporate и `mock_service` в app/kb;
  полного role-isolation сценария с запретами DDL/DML эта проверка не заменяет.
- `make check` остановился на contract snapshot guard: требуется consumer review и обновление
  TL lock. Lock намеренно не перегенерировался, поскольку RP-CONTRACT-REVIEW-01 еще IN_PROGRESS.
  Отдельные `ruff check`, `ruff format --check` и `pytest tests -q` прошли ранее: 50 tests.
- Исходный упавший проект `ai-buddy` и его частично инициализированный volume не удалялись.
  Исправление и отчет зафиксированы локальным коммитом в `feature/team-start-foundation`; push не выполнялся.
  RP-INF-01 остаётся IN_PROGRESS до v2-aware `verify-db`, CI acceptance и финальной проверки.
- `git diff --check` прошёл для TL-изменений.
