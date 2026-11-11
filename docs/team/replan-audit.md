# Отчёт о документационном перепланировании

Этот отчёт фиксирует завершённый RP-DOC-01 (база e6c1a0e). После него пользователь
назначил пять ролей и поручил TL-пакет: актуальные назначения/статусы находятся в
[handoff](assignments/README.md), [backlog](backlog.md) и [contract handoff](contract-handoff.md).
Число файлов/задач, untracked-состояние brief и pending назначения ниже — исторический
снимок того этапа, не статус текущего RP-TEAM-01.

2026-11-11 · RP-DOC-01 · основание: [CODEX_PROJECT_REPLAN.md](../../CODEX_PROJECT_REPLAN.md).
Изменяется документация текущей ветки feature/team-start-foundation. Код/JSON/SQL/seed/
runtime knowledge/config/CI не меняются, ветки не создаются и не переключаются,
коммит/push/PR не выполняются. Исходный brief владельца не редактируется.

## A–B. Изменённые и новые файлы

Полный перечень путей с назначением приведён в конце этого отчёта. Обновлены README,
инструкции агентов, Product Spec, архитектура/ADR/API/security/data/states/AI, UI guidelines,
все старые SDD, team/backlog/working agreements, testing и operations. Добавлены vision,
demo, event/template contracts, шесть новых feature-папок (ещё две обновлены на месте),
SDD index, contracts README и этот audit. Это документация, не новые runtime-функции.

## C. Что сохранено и что заменено

| Сохраняется | Заменяется / переносится |
|---|---|
| React/TypeScript/Tailwind/Query/Zod, Go, Python/FastAPI, PostgreSQL/pgvector | Центр продукта: RAG/словарь/checklist → Goal и Engineering Readiness |
| Go business owner, Python knowledge/AI, отдельный mock | Ручные todo/in_progress/done и update_task_status → evidence-driven states |
| app/kb/corporate, role isolation, новые SQL migrations | Все demo_public → team/resource/document ACL до LLM, включая metadata |
| Cookie/Origin/CSRF, SSE Python→Go→React, poll 5s | Repo-access demo/15s auto-approval → test DB, отдельный scoped approver, IAM и connection recheck |
| Immutable preview, confirm, TTL/idempotency/unknown-reconcile | Confirm intern не выдаёт grant; buddy answer не означает verified |
| Локальный synthetic demo, >80% line coverage каждого компонента | Простая summary → Buddy Debug Bridge с диагностикой/пересечением прав |
| Светлый reference/палитра/типографика/адаптивность | Чат-first → goal/state/blocker/next action/evidence с контекстным AI |
| HR вне MVP, один ограниченный агент | Добавлены P0 approver/docs-owner, friction/distinct>=2/candidate/human review |
| История ADR и INF blocker | Старые задачи/SDD явно superseded, live provider не блокирует offline P0 |

## D. Согласованность и трассировка brief

Во всех актуальных документах один путь: Goal → allowed Action → trusted Evidence →
Blocker/Friction → confirmed diagnostic Handoff → два unique interns → один Candidate →
Human Review. Actor/state/permissions задаёт Go, AI только предлагает. Продуктовые возможности
помечены planned; legacy executable artifacts отделены от target v2.

| Раздел brief | Где отражён результат |
|---|---|
| 1–3: смена видения/приоритетов, исследование/созвоны | [vision](../product/vision.md), [spec](../product/specification.md); нет заявления абсолютной уникальности |
| 4–5: Goal/Step/Dependency/Evidence/Blocker, JSON templates | [data](../architecture/data-model.md), [template](../architecture/journey-template.md), [states](../architecture/state-machines.md), journey SDD |
| 6: test DB, A/B/C, draft/confirm/approval/grant/check | Product §4, [access SDD](../features/access-request/spec.md), [verification SDD](../features/readiness-verification/spec.md), [demo](../product/demo.md) |
| 7: friction group, 2 distinct users, unique candidate/review | [Reverse SDD](../features/reverse-onboarding/spec.md), ADR-019/020, state/API/data |
| 8: diagnostic handoff/preview, safe data, reply | [Buddy SDD](../features/buddy-escalation/spec.md), security/API |
| 9: roles/team/resource/document ACL, pre-LLM privacy | [Security](../architecture/security.md), [authorization SDD](../features/authorization-and-privacy/spec.md), negative testing |
| 10: Practice First, code style после MVP | Product/vision/AI design; P2 backlog |
| 11: неизменный стек/ownership/SSE, новые pipelines | [Architecture](../../ARCHITECTURE.md), ADR-013–025; logical knowledge в physical kb, corporate mock owner сохранён |
| 12: маршруты/access/diagnostics/buddy/reverse/AI APIs и 12 events | [API](../architecture/api-contracts.md), [events](../architecture/event-contracts.md), [contracts transition](../../contracts/README.md) |
| 13: goal-first UI/cards/owner interface | [UI guidelines](../design/UI_GUIDELINES.md), Product §6, FE backlog |
| 14: P0/P1/P2 и порядок сокращений | Product §5 и [backlog](backlog.md); P0 feedback/security/offline не сокращаются |
| 15: пять разработчиков, AI autonomy | [Working agreements](working-agreements.md), ownership в backlog |
| 16: недельные дни/результаты | Backlog seven-day checkpoints и зависимости |
| 17: функциональная/security/technical приёмка | Product DoD, [testing matrix](../testing/strategy.md), 8 SDD |
| 18: пять минут, обе ошибки и owner card | [Demo](../product/demo.md), success/negative/restart/offline branches |
| 19: актуализация существующих файлов, восемь feature specs | File inventory ниже, [SDD index](../features/README.md), AGENTS/PROMPT_TEMPLATE |
| 20: антицели | Product §5, AGENTS, UI/AI/P2 backlog |
| 21: открытые вопросы и явные допущения | Раздел E ниже; никакого молчаливого предположения о реальной policy Авито |
| 22–24: единая модель, отчёт, документация до реализации | Этот отчёт, README status и RP-DOC-01; нет изменений кода |

Восьми фичам соответствуют 24 spec/design/tasks файла. Старые onboarding/chat — ссылки
на замену, access-request/buddy-escalation актуализированы. Все RP-ID ссылаются на единый
backlog; старые ID сохранены только в таблице миграции. Проверка ссылок/ID/требований
не является formal verification и не обещает отсутствие любых будущих дефектов кода.

## E. Допущения MVP и реальные решения TL

Минимальные явные допущения уже описаны для планирования; они не выдают внутренние
регламенты Авито за известные и не блокируют документационную задачу.

| Вопрос brief §21 | Безопасный baseline MVP / решение до реализации |
|---|---|
| Кто одобряет доступ | Отдельный access_approver с resource assignment; не инициатор; TL назначает человека/fixture |
| Buddy как owner ресурса | Не по умолчанию; требуется отдельная роль/assignment; в demo разделено |
| Команда и документы | Team + explicit resource/document permission, deny by default; закрытые team/restricted fixtures обязательны |
| Что передавать LLM | Только synthetic minimum, разрешённые chunks/safe goal/checks, без лишних профилей/PII/DSN; scope остаётся в retrieval boundary |
| Какие события trusted | Только Go workflows и authenticated/correlated mock adapters по event-contracts; browser/LLM/buddy text не evidence |
| Кто рассматривает candidate | Scoped documentation_owner инструкции, не HR; synthetic docs-owner-a назначает TL |
| Устаревшая инструкция | Сохраняем version/hash; latest human-approved версия задаётся ответственным; текущие goal pinned, auto-migrate нет |
| Без подтверждения | Чтение и явно запущенная safe проверка без выдачи прав; отправка заявки/handoff требует exact confirm, approval/review отдельные explicit decisions |
| Retention диагностики | Только local synthetic до explicit reset; до реальных/публичных данных TL утверждает сроки/удаление, сбор таких данных пока запрещён |
| Требования хакатона | Текущий baseline >80% по компоненту, Compose/SDD/README/data/PDF/video; оригиналы сверяет TL, пока доступны только brief/пересказ |

Требуют решения TL/владельца:

1. Назначить пять участников/reviewers и подтвердить synthetic approver/docs-owner/resource/
   document assignments (RP-TL-01). Имена отсутствовали, не придуманы.
2. Подтвердить перечисленные baseline policies, единый team-scoped P0 journey, физическую
   kb/corporate совместимость и target API v2 с потребителями (RP-CONTRACT-01). После review
   executable schema/DDL/fixtures обновляются синхронно, до этого реализации общего DTO нет.
3. Сверить оригиналы кейса/созвонов/исследования и правила покрытия/артефактов/сроки сдачи
   (RP-TL-02). Достоверность источников не подтверждена одним наличием brief.
4. Организовать доступное Docker-окружение/проверку startup fix и выделенную чистую
   synthetic demo-БД без потери текущих данных (RP-INF-01).

Реальные/публичные данные требуют отдельного retention/auth решения; это не обязательство
недельного local MVP. Provider/model/key/budget и публичная площадка — дополнительные
RP-AI-02/RP-HOST-01, не блокируют offline P0. Cross-version/cross-team grouping,
reopening candidate и полноценная review history не расширяются молча: за P0, TL/P1.

## F. Следующий шаг

Назначить роли RP-TL-01 и выполнить TL/consumer review в RP-CONTRACT-01, затем обновить
executable v2 schemas/examples и новые миграции RP-DATA-01. После принятого контракта
можно независимо начинать FE layout на помеченных fixtures, acceptance tests, AI offline
adapters и mock IAM; runtime integration соблюдает зависимости backlog. RP-INF-01 можно
проверять независимо при доступном Docker и явном управлении demo-данными владельцем.

Реализация новых возможностей этим заданием не начинается.

## Результат проверки RP-DOC-01

- `make check` (с UV_CACHE_DIR во временной папке): успешно. Local links, legacy JSON/seed,
  SQL syntax/YAML, ruff lint/format и pytest — **18 passed**.
- Дополнительная локальная проверка структуры: восемь активных фич / 24 SDD-файла,
  28 RP-ID в backlog, ссылки на ID и количество колонок Markdown-таблиц — успешно.
- Проверены текущие состояния/actor/action/ACL/grouping/review определения между Product,
  Architecture/API/events/states, восьмью SDD и задачами; traceability к brief приведена выше.
- `git diff --check` — успешно. Дополнительная финальная проверка локальных Markdown-ссылок
  (включая этот перечень, contracts README и инструкции) и графа зависимостей — успешно.
- Изменены только Markdown: 29 существующих и 25 новых файлов. Исходный untracked
  CODEX_PROJECT_REPLAN.md сохранён. Код, executable contracts, migrations, seed, runtime
  knowledge, lock/config/CI и image reference не изменены. Ветка feature/team-start-foundation.
- Component/E2E/Compose/live evals не запускались: поведения/кода не меняли, новые фичи
  ещё не реализованы. INF-01/RP-INF-01 остаётся открытой, старый volume не затронут.
- RP-DOC-01 завершена; RP-TL-01 и RP-CONTRACT-01 готовы к назначению/review, не к выдаче
  новых продуктов за работающие. Публикации/commit/PR/branch операций не было.


## Перечень изменённых файлов

| Путь | Изменение / назначение |
|---|---|
| [AGENTS.md](../../AGENTS.md) | Инструкции нового scope, ownership/security/evidence и ограничения docs-only/Git. |
| [ARCHITECTURE.md](../../ARCHITECTURE.md) | Goal/evidence/friction pipeline и сохранённые stack/service/schema границы. |
| [PROMPT_TEMPLATE.md](../../PROMPT_TEMPLATE.md) | Назначение задач по новому backlog и правила локальной работы. |
| [README.md](../../README.md) | Новое описание, честный статус legacy каркаса, запуск/проверки/роли/demo. |
| [docs/architecture/ai-design.md](../architecture/ai-design.md) | Structured AI, secure retrieval, offline/live adapters и evals. |
| [docs/architecture/api-contracts.md](../architecture/api-contracts.md) | Проектные v2 public/internal DTO/операции/SSE и переход с v1. |
| [docs/architecture/data-model.md](../architecture/data-model.md) | Целевая доменная модель, владельцы/транзакции/migrations/seed gap. |
| [docs/architecture/decisions.md](../architecture/decisions.md) | Сохранённая история ADR и решения 013–025. |
| [docs/architecture/security.md](../architecture/security.md) | Сессии и role/team/resource/document ACL, pre-LLM privacy, safe handoff. |
| [docs/architecture/state-machines.md](../architecture/state-machines.md) | Step/Goal/evidence/action/request/grant/check/blocker/candidate/run состояния. |
| [docs/design/UI_GUIDELINES.md](../design/UI_GUIDELINES.md) | Сохранены style tokens/layout; goal-first и approval/buddy/owner карточки. |
| [docs/features/access-request/design.md](../features/access-request/design.md) | Компоненты/данные/API/отказы. Заявка к тестовой БД: draft/confirm/approval/grant. |
| [docs/features/access-request/spec.md](../features/access-request/spec.md) | Поведение/правила/приёмка. Заявка к тестовой БД: draft/confirm/approval/grant. |
| [docs/features/access-request/tasks.md](../features/access-request/tasks.md) | Задачи/результаты/проверки. Заявка к тестовой БД: draft/confirm/approval/grant. |
| [docs/features/buddy-escalation/design.md](../features/buddy-escalation/design.md) | Компоненты/данные/API/отказы. Диагностическая передача и ответ buddy. |
| [docs/features/buddy-escalation/spec.md](../features/buddy-escalation/spec.md) | Поведение/правила/приёмка. Диагностическая передача и ответ buddy. |
| [docs/features/buddy-escalation/tasks.md](../features/buddy-escalation/tasks.md) | Задачи/результаты/проверки. Диагностическая передача и ответ buddy. |
| [docs/features/chat/design.md](../features/chat/design.md) | Superseded pointer на contextual-ai-assistance/design.md вместо старых требований. |
| [docs/features/chat/spec.md](../features/chat/spec.md) | Superseded pointer на contextual-ai-assistance/spec.md вместо старых требований. |
| [docs/features/chat/tasks.md](../features/chat/tasks.md) | Superseded pointer на contextual-ai-assistance/tasks.md вместо старых требований. |
| [docs/features/onboarding/design.md](../features/onboarding/design.md) | Superseded pointer на onboarding-journey/design.md вместо старых требований. |
| [docs/features/onboarding/spec.md](../features/onboarding/spec.md) | Superseded pointer на onboarding-journey/spec.md вместо старых требований. |
| [docs/features/onboarding/tasks.md](../features/onboarding/tasks.md) | Superseded pointer на onboarding-journey/tasks.md вместо старых требований. |
| [docs/operations/development.md](../operations/development.md) | Сохранены команды/версии/troubleshooting, обновлены checkpoint/transition. |
| [docs/operations/external-dependencies.md](../operations/external-dependencies.md) | Внешние ресурсы, scoped policy decisions и optional live/hosting. |
| [docs/product/specification.md](../product/specification.md) | Vision/value, P0/P1/P2, DB journey, роли, правила и DoD. |
| [docs/team/backlog.md](backlog.md) | P0-неделя, 28 задач с владельцами/зависимостями, legacy mapping и INF history. |
| [docs/team/working-agreements.md](working-agreements.md) | Пять участников, ownership/review и согласование контрактов. |
| [docs/testing/strategy.md](../testing/strategy.md) | Новая acceptance/security/evidence/reverse/offline матрица, сохранённый coverage gate. |


## Перечень новых файлов

| Путь | Изменение / назначение |
|---|---|
| [contracts/README.md](../../contracts/README.md) | Граница legacy executable v1 и проектного v2, задача синхронизации. |
| [docs/architecture/event-contracts.md](../architecture/event-contracts.md) | Trusted event envelope, обязательные события, correlation/dedup/обработка. |
| [docs/architecture/journey-template.md](../architecture/journey-template.md) | Версионированный JSON DAG и основной DB маршрут/recovery. |
| [docs/features/README.md](../features/README.md) | Индекс восьми актуальных фич и статус старых SDD. |
| [docs/features/authorization-and-privacy/design.md](../features/authorization-and-privacy/design.md) | Компоненты/данные/API/отказы. Auth/role/team/resource/document privacy. |
| [docs/features/authorization-and-privacy/spec.md](../features/authorization-and-privacy/spec.md) | Поведение/правила/приёмка. Auth/role/team/resource/document privacy. |
| [docs/features/authorization-and-privacy/tasks.md](../features/authorization-and-privacy/tasks.md) | Задачи/результаты/проверки. Auth/role/team/resource/document privacy. |
| [docs/features/blocker-detection/design.md](../features/blocker-detection/design.md) | Компоненты/данные/API/отказы. Ошибки, blocker и безопасные friction records. |
| [docs/features/blocker-detection/spec.md](../features/blocker-detection/spec.md) | Поведение/правила/приёмка. Ошибки, blocker и безопасные friction records. |
| [docs/features/blocker-detection/tasks.md](../features/blocker-detection/tasks.md) | Задачи/результаты/проверки. Ошибки, blocker и безопасные friction records. |
| [docs/features/contextual-ai-assistance/design.md](../features/contextual-ai-assistance/design.md) | Компоненты/данные/API/отказы. Goal/step AI, schemas/SSE и offline fallback. |
| [docs/features/contextual-ai-assistance/spec.md](../features/contextual-ai-assistance/spec.md) | Поведение/правила/приёмка. Goal/step AI, schemas/SSE и offline fallback. |
| [docs/features/contextual-ai-assistance/tasks.md](../features/contextual-ai-assistance/tasks.md) | Задачи/результаты/проверки. Goal/step AI, schemas/SSE и offline fallback. |
| [docs/features/onboarding-journey/design.md](../features/onboarding-journey/design.md) | Компоненты/данные/API/отказы. Goal, утверждённый маршрут/dependencies. |
| [docs/features/onboarding-journey/spec.md](../features/onboarding-journey/spec.md) | Поведение/правила/приёмка. Goal, утверждённый маршрут/dependencies. |
| [docs/features/onboarding-journey/tasks.md](../features/onboarding-journey/tasks.md) | Задачи/результаты/проверки. Goal, утверждённый маршрут/dependencies. |
| [docs/features/readiness-verification/design.md](../features/readiness-verification/design.md) | Компоненты/данные/API/отказы. Safe checks и trusted evidence. |
| [docs/features/readiness-verification/spec.md](../features/readiness-verification/spec.md) | Поведение/правила/приёмка. Safe checks и trusted evidence. |
| [docs/features/readiness-verification/tasks.md](../features/readiness-verification/tasks.md) | Задачи/результаты/проверки. Safe checks и trusted evidence. |
| [docs/features/reverse-onboarding/design.md](../features/reverse-onboarding/design.md) | Компоненты/данные/API/отказы. Distinct grouping/candidate/human review. |
| [docs/features/reverse-onboarding/spec.md](../features/reverse-onboarding/spec.md) | Поведение/правила/приёмка. Distinct grouping/candidate/human review. |
| [docs/features/reverse-onboarding/tasks.md](../features/reverse-onboarding/tasks.md) | Задачи/результаты/проверки. Distinct grouping/candidate/human review. |
| [docs/product/demo.md](../product/demo.md) | Пятиминутный путь A/B/C, данные, отказы и комплект сдачи. |
| [docs/product/vision.md](../product/vision.md) | Ценность Engineering Onboarding & Feedback Loop и позиционирование. |
| [docs/team/replan-audit.md](replan-audit.md) | Трассировка brief, решения/допущения TL, проверки и перечень файлов. |
