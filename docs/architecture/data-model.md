# Модель данных target v2

**Target v3:** [архитектура/DTO/ACL/переход](../v3/architecture.md),
[приёмка](../v3/testing.md). Ниже — v2 baseline; внутренний buddy send/reply не переносить
в новый интерфейс. В V3-CONTRACT-01 нужны реальные schemas/fixtures/consumer review;
проектные таблицы сами по себе не являются исполняемыми контрактами.

Версия 2.0 · 2026-11-11 · проектирование, не применённая DDL.
Текущие [app](../../backend/migrations/001_initial.sql),
[kb](../../ai-service/migrations/001_initial.sql),
[corporate](../../mock-services/migrations/001_initial.sql) — legacy v1.
Они содержат tasks, две роли и demo_public; перечисленные ниже расширения ещё отсутствуют.
RP-DATA-01 добавляет новые миграции: RP-DATA-BE-01 — app/corporate (Backend),
RP-DATA-AI-01 — kb/knowledge fixtures (AI), RP-DATA-TL-01 — общий runner/seed tooling (TL).
Применённые 001 не переписываются; описание DDL не означает готовность.

## Владельцы

| Физическая схема | Владелец / runtime | Целевая область |
|---|---|---|
| app | Go, app_owner / app_service | Пользователи, роли/permissions, маршруты/прогресс, диалоги, заявки, checks/evidence, blockers/friction, escalations, candidates/reviews, audit/idempotency |
| kb | Python, kb_owner / ai_service | Логическая knowledge: documents, chunks, embeddings, index_metadata, document ACL metadata |
| corporate | Mock, corporate_owner / mock_service | Synthetic resources, IAM grants, access requests/decisions, safe DB check results |

Одна PostgreSQL, отдельные no-login owners, runtime без DDL/чужих схем.
Нет cross-schema FK/JOIN: связи через API и IDs. Go не читает kb/corporate напрямую,
Python не читает app. Mock DB сценария не является PostgreSQL приложения.

## Целевые сущности app

| Сущность | Ключевые поля/ограничения |
|---|---|
| User / RoleAssignment / Permission | id, account_id, team_id, buddy_id; роли intern/buddy/access_approver/documentation_owner; scoped resource/doc assignments; deny by default |
| ResourcePolicy | resource_id, team_id, requestable_roles, approver_ids, allowed_verification_methods; только safe metadata |
| JourneyTemplate | journey_id, version, team_id, approved_by, content_hash, validated JSON; unique (journey_id,version), опубликованная версия неизменяема |
| Goal | id, intern_id, journey_id/version/hash, resource_id, status, version, created_at; одна активная цель данного journey у intern |
| StepProgress | goal_id, step_id, state, version, evidence_ids, blocker_ids, user_claim; unique(goal_id,step_id), state только Go |
| VerificationCheck | id, goal_id, step_id, method, operation_key, safe inputs, outcome, error_code, observed_at, source; immutable result, unique operation_key |
| Evidence | id, check_id/event_id, subject_id, resource_id, goal_id, step_id, journey_version, result, source, observed_at, invalidated_at; unique(source,event_id), проверка корреляции |
| Blocker | id, goal_id, step_id, type, error_code, latest_check_id, status:open/resolved, recovery_actions; ответ buddy не закрывает без evidence |
| FrictionEvent | id, journey_id/version, goal_id, step_id, intern_id, error_code, blocker_type, attempt_id, outcome, instruction_id/version, timestamp, safe_context; unique attempt/error |
| Action | id, actor_id, goal_id/step_id, type, parameters, immutable preview/hash, status, expires_at, result/error; версия контекста для повторной проверки |
| AccessRequest | id, action_id unique, intern_id, resource_id, requested_role, reason, mock_id unique, operation_key unique, status, grant_state, sync_status |
| Escalation | id, action_id unique, intern_id, buddy_id, goal_id/step_id/blocker_id, exact diagnostic_snapshot, status, answer/resolved_at |
| KnowledgeGapCandidate | id, journey_id, step_id, error_code, instruction refs/versions, affected_count, hypothesis, proposed_fix, state, owner_scope, enrichment_status; unique group key в P0 |
| CandidateContribution / Review | candidate_id + intern_id unique (внутренний distinct-count); review actor/decision/reason/version/time, resolved_reference; участники не выдаются в агрегат |
| BusinessEvent / AuditEvent | event envelope, safe payload, dedup key, actor/source, result; запись события и изменение app атомарны |
| Conversation / Message / Run | intern_id, goal_id/step_id либо общий контекст, partial-unique per owner/context; completed/partial, source refs; история только Go |
| Session / IdempotencyKey | hash session token/CSRF/expiry; (user,route,key,body_hash,response), TTL replay 24h; долгоживущие unique operation/action IDs |

Goal status выводится из шагов, не задаётся пользователем. Progress не stored checkbox;
API вычисляет verified/total/percent. Dependency и статические поля Step принадлежат
версии template, runtime status/evidence — StepProgress. Нет двух источников `status`.

## Knowledge и corporate

Document хранит id, title, version, content_hash, synthetic, team/resource/permission ACL,
status/current_version. Chunks наследуют ту же ACL и document version; индекс не должен
оставлять доступные старые chunks после отзыва доступа. Названия и метаданные защищены
так же, как содержание. Размерность/model фиксируются новой миграцией после выбора
embeddings; seed без псевдоэмбеддингов. Повторный ingest атомарно меняет chunks/ACL.

Mock хранит ресурсы db-team-a-test, db-team-b-test, db-restricted; grants по user/resource/role,
submitted/approved/rejected, отдельный grant state. Одобрение не вычисляется по времени.
DB check принимает только allowlisted method/options и возвращает passed/failed + safe code,
никаких DSN, SQL, строк таблиц или реального сетевого подключения.

## Транзакции, миграции и seed

Go применяет check/event ровно один раз: evidence + step transition + blocker/friction +
запись события одной app-транзакцией. Candidate резервируется unique key до AI enrichment;
ретраи не дублируют карточку. Ответ и resolved escalation атомарны. Optimistic version и
SELECT FOR UPDATE/conditional UPDATE защищают конкурентные переходы. Межсервисный сбой
не становится общей транзакцией: operation_key/reconcile восстанавливают результат.

Runner сохраняется: advisory lock, SET LOCAL ROLE, SHA-256 schema_migrations, порядок
app → kb → corporate. Повтор migrate пропускает применённые файлы, checksum mismatch — ошибка.
Seed идемпотентен по ID, не стирает progress/answers/decisions; изменённый knowledge требует
явного reindex. Reset удаляет volume только по отдельному явному запросу владельца.

Текущий dataset v1: intern-a команды A, intern-b команды B, buddy-a/buddy-b, 8 задач,
3 demo_public документа. Он не обеспечивает новый demo. Backend RP-MOCK-01 готовит users/resources/assignments dataset v2, AI RP-DATA-AI-01 — knowledge fixtures:
intern-a и intern-b команды A, intern-c команды B, buddy-a/buddy-b, approver-a, docs-owner-a;
назначения и переназначение intern-b выполняются явно миграцией/seed без тихой перезаписи
существующего профиля. Новое демо — на отдельной чистой локальной БД по инструкции владельца.
Не менять автоматически существующие пользовательские данные ради нового примера.
