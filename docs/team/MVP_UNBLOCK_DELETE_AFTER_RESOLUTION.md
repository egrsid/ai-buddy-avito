# ВРЕМЕННО — удалить после разрешения текущих вопросов и приемки MVP

**Дедлайн владельца: 12 ноября 2026, 22:00 МСК.** Все времена ниже — Europe/Moscow.
Файл нужен для передачи текущих конфликтов четырем участникам. После закрытия всех
пунктов, записи evidence в постоянные SDD/backlog/TL record и успешной репетиции **удалить
этот файл и ссылки на него**. Не удалять только потому, что подошел дедлайн.

План и продукт: [backlog](backlog.md), [Product Spec](../product/specification.md),
[testing](../testing/strategy.md). Решения TL/сведенные схемы/проверки уже здесь:
[tl-readiness.md](tl-readiness.md), [contract handoff](contract-handoff.md), [inventory](branches.md).
Это не новый scope. S1–S4, HR, реальные корпоративные API, live LLM/embeddings, второй
journey, public hosting и сложная аналитика не входят в срочный P0.

## 0. Сразу всем — одна база и честный статус

- Обновление после AI push: проверен **3f955322** (7 новых commits). Реализованы offline
  HTTP/SSE/ACL/diagnostics и 7 документов; 184 tests, 99.90% coverage, evals 29/29.
  [Подробный review и воспроизведение AI-R1–R4](ai-review-2026-11-12.md).
  Не ставить повторную разработку готовых модулей; приоритет AI — дефекты и persistent kb.
- [ ] Получить TL snapshot: BE 69fea38 + AI 0da47f6, BASELINE.sha256 и общие infra/tooling
  изменения (TL head уже fe870967); AI runtime отдельно 3f955322, schemas в нем не менялись.
  После contract corrections TL обновляет lock и записывает acceptance.
  Новые review/план изменения этого прохода локальные, без commit/push/PR. Автор/владелец распространяет
  их в соответствующие рабочие папки, сохраняя изменения; чужие ветки агентом не меняются.
- [ ] До 10:00 предоставить TL фактический остаток/оценку и явно подтвердить возможность
  своих checkpoints. Отсутствие оценки/ответа не является согласием и не гарантирует срок.
- [ ] Каждая поставка: source revision, измененные файлы, команды/exit codes, sample DTO,
  coverage своего компонента, remaining blockers. Не ждать одного большого merge вечером.

## 1. Backend — критический путь

Рабочая ветка feature/backend-mvp-v2. Полные назначения: [handoff](assignments/backend.md).

До общего contract gate (ориентир 10:00):

- [ ] RP-CONTRACT-BE-01: StepActionList={items:RecoveryAction[]} для GET step/actions,
  example/invalid и consumer binding input. Значения совпадают с Step.available_actions.
- [ ] Optional-null invalid cases для Run.assistant_message_id, Message.run_id и других
  optional полей. Верхнеуровневое Error.fields.name, {items} для списков, HTTP Date для
  Action TTL приняты TL; не требуется новая дискуссия по этим решениям.
- [ ] Явный BE↔AI review общей версии: scopes/refs, GenerateRequest, tool.proposed,
  generation.completed, structured draft/handoff/candidate, Source.url и internal errors.
- [ ] Проверить Go client уже против AI 3f955322; не ждать написания CORE/DIAG с нуля.
  AI-R2/R3: invalid response и late completion не создают Action; Go независимо
  контролирует 90s/terminal race. Не принимать ранний HTTP test за полный P0.
- [ ] Сверить семь document UUID/version из AI review с journey refs, permissions и
  docs-owner assignments. Backend подтверждает таблицу до seed; второй набор ID не вводить.

Далее по существующим RP-задачам:

- [ ] RP-DATA-BE-01/RP-MOCK-01: новые app/corporate migrations, семь аккаунтов
  intern-a/b (team-a), intern-c (team-b), buddy-a/b, approver-a, docs-owner-a; ресурсы и
  scoped assignments. Согласовать stable UUID документов с AI. Старый intern-b не
  переназначается молча, applied 001 не переписывается, текущий progress не стирается.
  Передать TL seed layout/table mapping уже с DATA-BE-01 для адаптации общих runners;
  не ждать реализации mock HTTP, чтобы не создать цикл DATA → MOCK → seed layout → DATA.
- [ ] RP-AUTH-01/RP-JOURNEY-01: реальные cookie/Origin/CSRF/ACL и own goals; JSON DAG
  select_resource/check_access/check_connection; текущий доступ из отдельного mock IAM.
- [ ] RP-CHAT-01/RP-MOCK-02/RP-ACCESS-01: persistent run/history/SSE; AI draft → exact
  preview → confirm → идемпотентная заявка → отдельное scoped approval → IAM recheck.
  Submitted/approved/grant/verified различаются, timeout/crash используют прежний key.
- [ ] RP-MOCK-03/RP-VERIFY-01/RP-BLOCKER-01: allowlisted ssl_mode, DB_SSL_REQUIRED и
  passed/unavailable; correlated trusted evidence, транзакционный reducer, version/dedup/
  stale/revoke tests; нормализованный blocker/friction сохраняется при сбое AI.
- [ ] RP-BUDDY-01/RP-REVERSE-01: exact ACL-filtered snapshot, assigned buddy reply+resolved;
  ответ не verified. Distinct intern>=2 по journey/step/code → один candidate; safe fallback,
  scoped review; accepted не публикует. Один intern/повтор доставки не достигает порога.
- [ ] Свои Go и corporate mock tests/coverage **строго >80% отдельно**, все auth/ACL/
  idempotency/event/timeout/cancel race negatives. Это не работа Fullstack.

Ориентиры: до 12:00 data/auth/journey/IAM; до 15:00 access; до 17:00 verification/buddy/feedback.
Передавать FE endpoints по готовности. Наибольший риск срока — объем оставшегося BE runtime.

## 2. AI Engineer — исправить границы и завершить persistent kb

Ветка feature/ai-mvp-v2. [Полный handoff](assignments/ai-engineer.md).

- [x] Поставлены offline provider, lexical ACL retrieval, internal API/SSE, journey/draft,
  classification/handoff/candidate, семь synthetic документов и evals. TL независимо
  подтвердил 184 tests/99.90%, включая повтор с TL schemas; evals 29/29, safety 18/18,
  retrieval 8/8. Это component evidence, не DONE CORE/DIAG/DATA или всего MVP.
- [ ] RP-CONTRACT-AI-01: включить актуальные common/public и подтвердить BE↔AI review.
  Самостоятельные копии common enums/AccessScope/Source запрещены.
- [ ] **AI-R1 / RP-DATA-AI-01:** добавить kb ACL migrations/storage/atomic ingest к уже
  готовому корпусу data/knowledge/v2; согласовать семь UUID/версии с BE. Сейчас storage
  in-memory из Markdown, не persistent kb; embeddings для offline не требуются.
- [ ] **AI-R2 / RP-AI-CORE-01:** response validation всех structured операций и boundary
  tests. Валидный запрос с пятью title по 200 символов дает clarification 1051 при лимите
  1000 и HTTP 200. Не расширять wire schema односторонне, исправить producer.
- [ ] **AI-R3 / RP-AI-CORE-01:** deadline после provider/EOF и до успешных events; budget
  85s непотоковых операций. Fake clock t=86 при EOF сейчас приводит к completed при
  budget=85. Добавить regression/cleanup tests; Go независимо обеспечивает свой deadline.
- [ ] Передать **проверенные JSON argv** AI_INGEST_COMMAND и AI_DB_TEST_COMMAND, exit codes,
  обязательные env/deps. CLI работает напрямую с kb под ai_service без DDL и AI HTTP;
  повтор ingest не дублирует chunks. Mock ingest без сети/ключа/model downloads.
- [ ] /readyz реально проверяет schema/index/migrations. Target overlay уже ждет ingest
  и /readyz; пустой индекс/отсутствующий CLI не маскировать liveness или exit 0.
- [ ] **AI-R4 / RP-AI-DIAG-01:** eval runner возвращает nonzero при любом failed P0 case.
  Сейчас при 28/29 и failure в non-safety journey-db-access summarize.ok остается true.
  Подтвердить ручное чтение полных 29 outputs (report обрезает их), review Backend.
- [ ] Реальные kb/pgvector/ACL integration tests под ai_service; unit tests с fake storage.
  Provider timers 20/25s, pipeline 85s, ping 10s, HTTP error order и faults по TL policy.
- [ ] После исправлений повторить AI coverage >80% и все 29 eval cases, затем DB/restart
  acceptance; текущий высокий coverage не доказывает отсутствия boundary defects.
  Production dependencies/минимальный lock diff — TL; ключ и платный spike для P0 не нужны.

Порядок: немедленно передать уже готовый API потребителю Go и согласовать IDs; до 12:00
kb/CLI/readiness/DB tests; до 14:00 AI-R2/R3 и повтор CORE; до 17:00 AI-R4/ручной review
и DIAG acceptance. Если время checkpoint прошло, сразу дать остаток/новую оценку TL,
не отмечать пункт выполненным и не переносить молча дедлайн 22:00.

## 3. Frontend — сначала исправить контракт, затем реальные операции

Ветка feature/frontend-mvp-v2. [Полный handoff](assignments/frontend.md).

- [ ] RP-CONTRACT-FE-01: обновить ErrorCode.CLIENT_DISCONNECTED, ResourceAccess до первой
  проверки, Run interrupted/cancelled/completed refinements, StepActionList/null cases.
  Прогнать общий набор BE+AI/FE DTO: в аудите **4 failed /181**, требуется ноль failures и
  записанный повторный review, а не старые 122 проверки на старом snapshot.
- [ ] RP-FE-01: компонентные tests настоящего rendering/interaction/loading/error/empty/
  forbidden/expired/unknown/mobile/keyboard. Сейчас 171 parsing/fixture test pass, но
  **coverage 48.09%**, страницы/компоненты 0%; нужно >80%, без исключения UI из denominator.
- [ ] Исправить StepPage preview: сейчас берется pending create_access_request, а UI
  называет его handoff buddy. Использовать правильный Action.preview, точный snapshot
  и получателя, а не статическое описание; confirm/cancel вызывают Go.
- [ ] RP-FE-02: server demo-login/CSRF вместо смены роли в React; TanStack Query/Go API,
  goal/step/check/request/approval, ssl_mode=disable/require, contextual chat/SSE/cancel/
  retry/partial, source drawer с Go ACL и HTTP Date для TTL. Unknown IDs не подменять
  первой fixture, состояние не продвигать локально вместо ответа сервера.
- [ ] Использовать новую AI-поставку только через Go: Python остается внутренним,
  его coverage/evals не закрывают FE rendering, source ACL, SSE recovery и browser tests.
- [ ] RP-FE-03: buddy queue/detail/reply и docs-owner review через Go; версия/конфликты,
  resolved reference, accepted без publish; после reload данные сохранены сервером.
- [ ] RP-E2E-01: новые browser spec файлы A/B/C — реальные клики/login/confirm/approve/
  IAM recheck/SSL error/buddy/recheck/второй intern/candidate/owner. Нет route interception.
  Reload и настоящий backend restart с TL; intern-c/чужой buddy/approver/owner negatives.
  frontend/e2e/onboarding.spec.ts и QA-план принадлежат Fullstack — не перезаписывать.

Ориентиры: до 10:00 typed review; до 15:00 основная интеграция; до 17:00 feedback UI;
до 19:00 полный browser/coverage report и UI capture для demo.

## 4. Fullstack–QA–Integration — только RP-QA-01

Ветка feature/qa-01-m1. [Полный handoff](assignments/fullstack-qa-integration.md).

- [ ] Владелец/автор обновляет базу, сохраняет два QA-файла. В docs/team/backlog.md
  трехсторонняя проверка дает conflict: оставить актуальный RP backlog, не legacy S1–S4.
- [ ] Адаптировать только frontend/e2e/onboarding.spec.ts и docs/testing/qa-01-m1.md:
  (1) своя v2 goal/steps/progress/reread, intern-b/c и buddy isolation;
  (2) 401 без сессии и POST goal без CSRF →403 с неизменностью данных.
  IDs брать из API, legitimate create с Origin/CSRF/UUID Idempotency-Key, без PATCH done.
- [ ] Запустить против настоящих Go/DB/mock после auth/journey поставки, передать Backend/TL
  команду/exit/output/ограничения. До готовности API писать BLOCKED, не skip ради green.

Ориентир: адаптация до 12:00; фактический прогон до 16:00 при готовности API.
Mock/DDL/seed/Compose/CI/общий E2E/чужое покрытие/PDF/video этой роли не добавляются.

## 5. Остаток совместной приемки и график до 22:00

| Не позднее 12 ноября | Наблюдаемый результат | Кто передает |
|---|---|---|
| 10:00 | Единый contract snapshot, FE retest, BE↔AI acknowledgements | BE + AI + FE → TL final record/lock |
| 12:00 | v2 data/ACL/IAM/journey; согласованные document IDs, AI ingest/readiness/DB commands | BE + AI → TL runner adaptation/target startup |
| 14:00 | AI-R2/R3 исправлены; повтор CORE tests и Go boundary проверки | AI + BE |
| 15:00 | Реальный draft/confirm/approval/grant recheck | BE + AI CORE + FE |
| 17:00 | SSL evidence/blocker/buddy, второй intern/candidate/review; AI-R4 и полный eval review | BE + AI DIAG + FE |
| 19:00 | Все component coverage >80%, API/browser/security/offline/restart результаты | Все авторы; TL сводит |
| 20:00 | Исправлены найденные P0 defects и повторены затронутые проверки | Владелец дефекта |
| 21:00 | Чистая репетиция, проверенные README/SDD, demo capture/PDF/video | TL + FE capture |
| 22:00 | Принятый воспроизводимый local offline MVP и комплект сдачи | TL по фактическому evidence |

Это рабочие checkpoints, не подтвержденные оценки исполнителей. При пропуске checkpoint
сразу предъявить TL failing command/остаток/оценку; не ждать вечера. Сокращаются только
P1/P2. Нельзя вырезать ACL/confirm/evidence/error/feedback/offline или считать fixtures
продуктом ради срока. При недоставленном runtime обещать «точно готов» нельзя.

TL уже подготовил contract review/решения/lock, schema image/test target, target overlay/
CI/preflight и UTF-8 runner foundation; clean legacy startup/repeat/isolation проверены.
Зависящие от поставок TL действия остаются явными: адаптация v2 seed/check/verify-db,
запуск реального ingest/AI DB tests, final contract/интеграционная приемка и demo. Они
не объявляются DONE заранее. Оригинальные требования/формат сдачи не приложены; внутренний
release gate — утвержденные Product/SDD/testing. Платный LLM/public hosting не блокируют P0.

## 6. Условие удаления этого файла

- [ ] Все задачи выше имеют фактические результаты/версии/outputs в постоянных SDD/backlog.
- [ ] Общий snapshot/consumer gate принят и доставлен участникам без потери QA работы.
- [ ] A/B/C, все safety/idempotency/offline/restart cases и >80% каждого компонента пройдены.
- [ ] Финальная репетиция и комплект сдачи соответствуют реализации.
- [ ] Удалены этот временный файл и ссылки на него; постоянный TL record сохраняется.
