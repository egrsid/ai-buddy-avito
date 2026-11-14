# Архитектура и контрактные предложения v4

Target; JSON schemas/SQL/runtime этим документом не создаются. [Решения](decisions.md).
Сохраняются React → Go → Python; app у Go, kb у Python, corporate у отдельного mock.
Новые данные — только additive migrations владельца, без переписывания старых SQL.

## Модели

| Объект | Владелец | Ограничение |
|---|---|---|
| WorkspaceLink | Go/app | assignment_id + goal_id, revision; explicit creator; one assignment → 0/1 goal, goal → 0/N assignments |
| RevisionProposal | Go/app | report/version/section/base hash; selected changes; generation revision; origin/expiry, status |
| RevisionDraft | Python output | bounded permitted replacement fields, evidence refs, questions, no app writes |
| VersionExposureEpisode | Go/app | intern/assignment/version, server start/end, source=assigned/adopted; no fabricated v3 backfill |
| ImpactComparison | Go read model | explicit scope/versions/section/reason/as_of, observation window, cohort counts, exclusions/privacy flags |
| EvidenceTimeline | Go read model | trusted event/check summaries + current derived state, no raw audit/chat/log export |
| DemoRunManifest | TL local harness | code/schema/data revisions, profile, outcomes, safe correlation, usage status; no key/prompt/PII |

## Workspace linking и ACL

Автор ТЗ выбирает разрешённый journey template при назначении, а не читает чужие goal IDs.
Стажёр явно принимает связь: Go находит/создаёт own goal по template, проверяет intern,
team/resource и pinned assignment. Existing verified journey возвращается прежним goal,
повторный маршрут не создаётся. Если template недоступен — связь не создаётся, ТЗ остаётся
читаемым по прежнему ACL. Произвольный клиентский goal_id не открывает чужой контекст.
Существующие назначения не связываются по сходству названий/AI: явный preview/confirm.

Связь проверяется при каждом чтении. Revoke resource оставляет безопасное сообщение о
недоступности без названий/ID закрытого goal. Изменение owner/team/assignment инвалидирует
link/proposal права. Link не расширяет mentor scope: подробная intern timeline доступна
только самому intern. Mentor получает разрешённый snapshot через прежний preview или
агрегат своих ТЗ. Documentation owner — только instruction/candidate scope.

## Предлагаемый API (до G1)

Новые операции под `/api/v4`; v2/v3 routes сохраняются. Публичные поля обсуждаются BE/FE,
internal AI — AI/BE; использовать общие UUID/time/error conventions без копирования типов.

| Операция | Вход / ответ |
|---|---|
| GET /workspaces | Own summaries, две оси статуса, next_action из Go, opaque cursor/limit≤20 |
| GET /workspaces/{assignment_id} | Pinned brief + nullable permitted linked goal summary; link revision |
| POST /workspaces/{assignment_id}/link-preview | template_id/version → immutable preview/hash, expiry 10m |
| POST /workspaces/{assignment_id}/link-confirm | preview_id/hash/expected_revision → Workspace; idempotency UUID |
| GET /goals/{id}/evidence-timeline | bounded entries/cursor/current state/as_of; limit≤50 |
| POST /task-clarity-reports/{id}/revision-proposals | expected_report_version/base_brief_version/hash → proposal; UUID key |
| GET /revision-proposals/{id} | status, field changes, evidence refs, questions, origin, base/draft revisions |
| POST /revision-proposals/{id}/apply | selected_change_ids + expected_draft_revision + proposal_revision/hash → draft; UUID key |
| POST /revision-proposals/{id}/discard | expected_revision → terminal proposal |
| POST /task-briefs/{id}/impact-config | owner confirms before/after versions + enrollment ranges + stable section/reason + comparable flag + expected_revision; UUID key → config revision |
| GET /task-briefs/{id}/impact | before/after versions, section/reason, as_of → comparison with no identities |

GET list pagination фиксирует as_of и sort/key tie-breaker; limit/cursor bounded,
каждая страница re-authorized. Unknown/duplicate filters отклоняются; переданные actor,
owner/scope/count не принимаются. Схемы error не создаются заново: 401 unauthenticated,
403 role, одинаковый 404 foreign/missing, 409 stale/expired, 422 invalid input, safe upstream
error. Права проверяются до чтения label/count и до idempotency replay, не только на create.

Для назначения предлагается additive optional permitted_template_ref в v4 assignment DTO;
сохраняет авторский выбор, не создаёт goal и не даёт template permission. Точное расширение
принимается BE/FE в G1. Link-confirm intern использует только этот проверенный выбор.
Comparison GET использует существующий owner-confirmed impact-config revision; не пишет
подтверждение сопоставимости при просмотре. Revoke/config change инвалидирует старый cursor.
Если draft отсутствует, apply принимает expected_draft_revision=null и создаёт successor
только при всё ещё отсутствующем draft; появившийся concurrent draft → 409.

## AI boundary

Internal proposed POST `/internal/v4/revision-draft`: Go передаёт только конкретный
разрешённый раздел и минимальные соседние criteria, report aggregate, allowed refs, base
hash/version. Без intern IDs, Telegram, raw logs/chat. Выход: changes (field path allowlist,
old hash, replacement ≤4000 chars), rationale ≤2000, evidence refs, questions, outcome.
Максимум 10 changes/10 questions/5 refs. AI не задаёт mandatory steps/permissions/verified.
Go повторно валидирует bounds, refs и base; invalid/unavailable → человек продолжает
ручное редактирование. Не делать из сбоя модели «готовое AI-исправление».

## State/write invariants

Request/generation, apply и publish разделены. Go резервирует один proposal на request key,
не держит DB transaction во время provider call; generation token защищает от позднего
ответа после discard/revoke. Apply атомарно re-authorizes report/brief/refs, проверяет
TTL 10m, base hash/version, expected draft revision и выбранные IDs, изменяет только draft,
пишет audit событие с hashes (без полного текста) и applied status. Повтор с тем же key/body
возвращает тот же draft; другой body — conflict. При новой ручной правке нужен fresh preview;
AI не перетирает изменения и не публикует. Proposal после restart восстанавливается,
interrupted generation не становится ready. Ошибка schema/source не выдаёт partial diff.

## Events и миграция

Go события (предложения): workspace_linked/unlinked, proposal_requested/generated/
applied/discarded, brief_version_exposed/ended. Correlation/subject/resource/version и
uniqueness — по существующему event envelope; никакого trust к browser timestamps.
Check/evidence/business events v3 не переименовываются. Impact GET/timeline GET не создают
friction/events. Legacy records имеют exposure unknown; новые эпизоды собираются с момента
включения v4, без обнуления БД и без восстановления истории из текущей assignment row.

Таблицы/indexes/uniqueness/foreign keys и permission codes предъявляет BE в G1/G2.
Не связывать demo seeding с reset; повторный seed не возвращает отозванные ACL или решения.
