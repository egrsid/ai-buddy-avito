# TL readiness и решения по интеграции

## Текущая локальная Backend-поставка · 2026-11-12

Владелец разрешил TL реализацию в Backend и отдельно подтвердил fetch, создание tracking
ветки и switch. Текущая ветка `feature/backend-mvp-v2`, HEAD
4813d7caa4a586a6ac26749f523406602962e24d. Изменения runtime/tests/документации находятся
в working tree, без commit/push/PR. TL ref c0659195 сохранён; AI/FE/QA файлы и refs не менялись.
Разрешение на реализацию не является consumer acknowledgement или финальной приёмкой MVP.

### Что реализовано

- Go `/api/v2`: sessions/Origin/CSRF/fresh ACL, resources, immutable validated journey,
  goals/steps/checks, conversations/messages/runs/SSE, actions/access requests/decisions,
  knowledge proxy, buddy queue/reply, friction/candidates/review.
- Corporate mock — отдельный persistent Python service: internal auth/request ID/schema,
  resource policy, request/scoped decision, отдельный IAM grant/read и safe SSL checks.
  Submitted/approved/present/verified различаются; approval и buddy reply не выполняют verification.
- App/corporate migrations 003 и app 004 добавлены после существующих 001/002, с owner/goal/
  step/check correlations и unique open blockers. Применённые SQL не переписаны.
- Explicit `SEED_DATASET=v2`: семь synthetic users, a+b team-a и c team-b, approved template,
  resource/document permissions. Повтор не стирает progress/grants и не восстанавливает
  отозванные ACL/roles/approvers. Конфликт старого intern-b требует свежей v2 DB.
- Durable executing перед corporate write, stable operation key, unknown/restart reconcile,
  immutable preview/TTL/повторная авторизация и запрет эквивалентной неизвестной/поданной заявки.
- Trusted checks/events/evidence, stale/correlation guard, optimistic versions, downstream
  invalidation. Polling может инвалидировать отозванный grant, но не повышает blocked шаг
  до verified и не меняет версии при здоровом IAM. Unavailable не закрывает исходный blocker.
- SSE single terminal/cancel/disconnect/retry, queued timeout, общий hard deadline независимо
  от heartbeat, buffering sources/tools до validation+commit. Отозванные источники убираются
  из истории/следующего prompt; старые AI hypotheses скрываются при потере доступа к refs.
- Idempotent replay заново проверяет domain ACL, scope и назначение; старый ключ не
  раскрывает action/review/buddy response после отзыва прав. Позитивные повторы сохраняют результат.
- Distinct-intern grouping с lock/unique candidate, safe AI aggregate/enrichment/fallback,
  human review/version и новая проверенная reference для resolved; никаких автоматических KB writes.
- CI backend/python jobs получили отдельный PostgreSQL и setup; image содержит v2 schemas,
  выполняется под app. AI/FE/QA business code и shared schemas не менялись.

### Фактически выполненные проверки

| Проверка | Результат |
|---|---|
| make check | Docs/schema/SQL/Compose/lint/format + 53 shared tests pass |
| Go 1.27.3 container | go test -race, go vet, go build pass; line coverage **1490/1840 = 80.9783%** |
| Corporate component runner | 6 tests pass; coverage **98.05%** |
| Clean migrate/seed | Новая DB, повтор migrations и seed; checksum protection, конфликт legacy assignments/revoked ACL regression |
| Настоящий API P0 | Go → corporate → PostgreSQL: два intern, confirm, scoped approval, IAM recheck, SSL blocker, buddy/recheck, один SSL candidate, under_review → accepted |
| Restart | Go restart, затем PostgreSQL+Go restart; verified progress, resolved buddy replies и accepted candidate сохранены; повтор seed не стирает состояние |
| Docker image | Сборка backend/Dockerfile, uid=1000(app), встроенные schemas читаются, /readyz=200 |
| Изоляция области | Нет diff в contracts/, ai-service/, frontend/, data/knowledge/; чужие refs не менялись |

Go line metric вычислен тем же scripts/go_coverage.py, что использует component runner;
statement coverage выводится отдельно. На хосте нет Go, поэтому Go-команды выполнены
закреплённым контейнером с C compiler для -race. API acceptance воспроизводится через
scripts/backend_acceptance.py только на свежем выделенном v2 dataset; проверки не
перехватывают бизнес-API и не подменяют evidence/approval прямыми SQL-правками.
В negative/component tests используются test-only fault fixtures; они не объявлены demo.

### Что остаётся открытым

- Consumer acceptance BE↔AI↔FE на единой базе; текущий Go AI contract harness не является
  запуском настоящего AI runtime/provider. Полный FE browser A/B/C, refresh/security/offline
  и общий AI/FE restart ещё не выполнены. Исторические AI review ниже — не новый аудит его head.
- AI Engineer подключает собственный runtime/KB ingest/index и выполняет provider-input,
  retrieval/diagnostics/live eval acceptance. Ключ, окружение, оплата/расходы, лимиты и вся
  интеграция LLM — полностью AI Engineer, без ожидания подтверждения TL.
  Основная модель по решению владельца — ai-sage/GigaChat3.5-432B-A28B, без reasoning.
- Frontend подключает реальные Go API/SSE/DTO вместо fixtures; QA запускает только свои
  два API smoke. TL проводит общую интеграцию/репетицию после этих входов.
- make verify-db пока относится к legacy dataset; v2 KB/roles acceptance требует сведённой
  AI-поставки и отдельного запуска, а не объявления legacy smoke продуктовой приёмкой.
- Backend задачи в backlog — IN_PROGRESS с фактической поставкой, не авансовый DONE.
  Публикацию/commit/push и распространение working tree выполняет владелец.

Финальный backend/Dockerfile image также прошёл полный свежий API acceptance и restart
PostgreSQL+Go. Проверочные контейнеры/host mock процессы этого прохода остановлены;
выделенный ai-buddy-be-v2-test и его данные сохранены, volumes не удалялись.

## Предыдущая TL-поставка — исторический snapshot

Следующие разделы сохранены как provenance прежней TL задачи. Утверждения «только docs»,
«bootstrap» и старые SHA относятся к тому проходу; текущий Backend результат указан выше.

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
Соответствие неизвестным правилам организаторов не утверждается. Live provider/embeddings,
public hosting, второй journey и P1/P2 не добавляются в дедлайн. Ключ/бюджет P0 не требует.
Публикация/доставка локального результата в рабочие ветки еще не выполнялась; чужие ветки
обновляет их автор/владелец по Git-контракту. Перед обновлением сверить текущие heads.

Изолированный проект после проверки остановлен командой compose down **без --volumes**;
его ai-buddy-tl-20261111_pgdata сохранен. Docker Desktop остается запущенным. Контейнеры
и volumes других проектов не менялись.
