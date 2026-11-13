# V3 Backend API — фактическая реализация (ветка feature/backend-v3)

13 ноября 2026. Предложение к contract gate V3-CONTRACT-01: схемы уже исполняемые и
проверяются Go на каждом запросе/ответе, но имена DTO ещё может поправить ревью TL/FE.
Схемы: `contracts/v3/public.schema.json` (публичные DTO), `events.schema.json` (внутренние
события Go), `ai.schema.json` (Go↔Python). Общие типы (Uuid, StableId, Timestamp, ошибки)
берутся из `contracts/v2/common.schema.json`; v2-контракты не менялись.

Общие правила как в v2: cookie-сессия, для POST — `Origin`, `X-CSRF-Token`,
`Content-Type: application/json`; `Idempotency-Key` (UUID) обязателен там, где отмечено «ключ».
Ошибки — `{error:{code,message,request_id}}`: чужой объект 404 `NOT_FOUND`, устаревшая
версия/истёкший preview 409 `VERSION_CONFLICT`, неверное тело 422 `VALIDATION_ERROR`,
нет роли 403 `FORBIDDEN`. Новых кодов ошибок нет.

## Telegram-контакт наставника (V3-CONTACT-01) — роль intern

| Запрос | Ответ |
|---|---|
| `GET /api/v3/me/mentor-contact` | `MentorContact`: `{status:"available", display_name, telegram_url:"https://t.me/<username>", contact_revision}` или `{status:"missing"}` |
| `POST /api/v3/mentor-contact-preview` `{goal_id, step_id, question?}` или `{assignment_id, section_id?, question?}` | 201 `ContactPreview`: `{id, text, content_hash, contact_revision, telegram_url, expires_at}` (TTL 10 мин) |
| `POST /api/v3/mentor-contact-export` `{preview_id, content_hash, contact_revision}` | `ContactExport`: `{text, telegram_url}` — текст для буфера обмена |

Контакт берётся только из назначенного наставника (`users.buddy_id`), ник проверяется и
ссылка строится в Go. Текст собирается заново при export: если за 10 минут изменилось
состояние шага, контакт или права на документ — 409, FE заново делает preview.
В тексте: цель, шаг и его статус, блокер, последние проверки, инструкции, которые видят
и стажёр, и наставник, вопрос (секреты и почта заменяются на `[redacted]`). Нет ID людей,
логов, сырого чата. Backend ничего не отправляет: открыть ссылку и вставить текст — действие
пользователя, статуса «доставлено» нет.

## ТЗ наставника (V3-TASK-01) — роль buddy (автор)

| Запрос | Ответ |
|---|---|
| `GET /api/v3/mentor/interns` | `InternList` — стажёры команды автора для назначения |
| `GET /api/v3/task-briefs` | `TaskBriefList` — свои ТЗ |
| `POST /api/v3/task-briefs` `{content}` (ключ) | 201 `TaskBrief`, черновик версии 1 |
| `GET /api/v3/task-briefs/{id}` | `TaskBrief` |
| `POST /api/v3/task-briefs/{id}/draft` `{content, expected_revision}` | сохранить черновик; если черновика нет — создать следующую версию из присланного текста |
| `POST /api/v3/task-briefs/{id}/publish` `{expected_revision}` | черновик становится опубликованной неизменяемой версией |
| `POST /api/v3/task-briefs/{id}/archive` `{expected_revision}` | новых назначений больше нельзя |

`content` = `{title, goal, sections:[{id,title,text}], expected_result,
acceptance_criteria:[{id,text}], refs:[{document_id,version}]}`. id разделов стабильные
(`^[a-z][a-z0-9_-]*$`), уникальные и не совпадают с зарезервированными `goal`,
`expected_result`, `acceptance_criteria`. В refs — только документы, которые автор может
читать. `TaskBrief` = `{id, title, state: draft|published|archived,
latest_published_version, draft, versions[], assignment_count, open_report_count,
revision, created_at, updated_at}`. Любое изменение увеличивает `revision`.
Опубликованную версию запрещает менять и триггер БД.

## Назначения (V3-TASK-01)

| Запрос | Кто | Ответ |
|---|---|---|
| `POST /api/v3/task-assignments` `{brief_id, brief_version, intern_id}` (ключ) | автор | 201 `TaskAssignment`; повторное назначение того же стажёра — 409 |
| `GET /api/v3/task-assignments` | стажёр — свои, автор — по своим ТЗ | `TaskAssignmentList` |
| `GET /api/v3/task-assignments/{id}` | они же | `TaskAssignment` |
| `POST /api/v3/task-assignments/{id}/adopt-version` `{brief_version, expected_revision}` | стажёр или автор | перейти на более новую опубликованную версию |

`TaskAssignment` = `{id, brief_id, brief_version, brief_state, latest_published_version,
content (текст закреплённой версии), intern, author, reported_sections, verification:
"not_verified", revision, ...}`. Если `latest_published_version > brief_version`,
FE показывает «есть новая версия» и кнопку перехода (preview — это `content` новой версии
из `TaskBrief`). `reported_sections` видит только сам стажёр, автору всегда `[]`.
Назначение и переход на версию не меняют цели, проверки, права и `verified`.

## Неясность ТЗ и отчёт наставнику (V3-FRICTION-01, V3-REVIEW-01)

| Запрос | Кто | Ответ |
|---|---|---|
| `POST /api/v3/task-assignments/{id}/frictions` `{section_id, reason}` (ключ) | стажёр | 201 `FrictionReceipt` `{status: recorded|already_recorded, ...}` |
| `GET /api/v3/task-clarity-reports` | автор ТЗ | `TaskClarityReportList` |
| `GET /api/v3/task-clarity-reports/{id}` | автор ТЗ | `TaskClarityReport` |
| `POST /api/v3/task-clarity-reports/{id}/review` `{decision, reason, expected_version, resolved_version?}` (ключ) | автор ТЗ | `TaskClarityReport` |

`reason`: `requirement_unclear` «Неясно требование», `outcome_unclear` «Неясен результат»,
`acceptance_unclear` «Неясен критерий приёмки». `section_id` — id раздела или
`goal`/`expected_result`/`acceptance_criteria`. Группа = команда + автор + ТЗ + версия +
раздел + причина. Повтор того же стажёра не увеличивает счётчик. Когда в группе 2 разных
стажёра за последние 30 дней — создаётся один отчёт. Отчёт: `{brief_title, brief_version,
latest_published_version, section_title, reason, state, current_count (за 30 дней),
lifetime_count, last_seen_at, hypothesis, suggestion, enrichment_status, version, ...}` —
без стажёров. Отчёт сохраняется сразу с шаблонным текстом Go и `enrichment_status:
"pending"`; после ответа стажёру Go в фоне (до 30 с) просит у AI-сервиса гипотезу
(`/internal/v3/task-clarity-draft`) и заменяет текст → `completed`. Сбой AI → `failed`,
шаблонный текст остаётся. FE может перечитать отчёт, пока статус `pending`.
Ревью как у карточек docs-owner: `proposed → under_review → accepted|rejected`,
`accepted → resolved` только с `resolved_version` — опубликованной версией этого ТЗ новее
версии отчёта. Принятие отчёта ничего не публикует.

## Карточки целей (V3-GOALS-BE-01) — роль intern

`GET /api/v3/goals?limit=1..20&cursor=...` → `GoalSummaryList` `{items:[{id, title,
journey_id, journey_version, status, version, progress:{verified,total,percent},
step_count, updated_at}], next_cursor}`. Новые сверху, курсор стабилен. Подзадачи при
раскрытии карточки — существующий `GET /api/v2/goals/{id}`. Процент считает Go:
floor(verified/total×100), 0 шагов — 0%.

## Статистика (V3-STATS-BE-01)

- `GET /api/v3/statistics/mentor?source=technical|task_clarity&days=7|30|90&limit=1..50&cursor=N` — роль buddy.
  `technical` — упавшие проверки назначенных ему стажёров; `task_clarity` — отметки по его ТЗ.
- `GET /api/v3/statistics/documentation?days=...` — роль documentation_owner: проблемы шагов
  с его инструкциями (по версиям инструкции) и связанные карточки.

Ответ `Statistics`: `{view, source_kind, as_of, timezone: "Europe/Moscow", window:{from,to,days},
privacy_threshold: 2, summary, rows[], daily[], next_cursor}`. Метрики:
`affected_interns` (разные стажёры), `observations` (разные проверки/отметки),
`open_items` (открытые блокеры или отчёты), `suppressed`. Группа, где меньше 2 разных стажёров,
отдаётся с `null` и `suppressed: true` и не входит в итог и в график по дням. Если видимых групп
нет, а скрытые есть — итог тоже скрыт. `CHECK_UNAVAILABLE` и сбои LLM/Telegram в статистику не
попадают. Фильтра по стажёру нет: лишний параметр запроса — 422. Ничего не записывает.

## Кто ответил в чате (V3-LLM-OBS-01)

AI-сервис перед источниками шлёт событие `response.origin` (`contracts/v3/ai.schema.json`).
Go сохраняет его в `messages.origin` и отдаёт:
- в SSE перед `run.completed`/`run.failed`: `event: message.origin` с
  `{run_id, message_id, origin}` (v2-клиенты незнакомое событие пропускают);
- в истории: `GET /api/v3/conversations/{id}/message-origins` → `{items:[{message_id, run_id, origin}]}`.

`origin` = `{mode: live|mock|unknown, answered_by: primary|secondary|offline|unknown,
completion: complete|interrupted, reason_code?: config_mock|cooldown|timeout|model_unavailable|budget_denied}`.
Старые сообщения и ответы без отчёта AI — `unknown`, текст ответа для метки не используется.

## Отключение внутренних обращений (V3-MIGRATE-01)

- Блокеры и шаги больше не предлагают `escalate_to_buddy`; `POST /api/v2/actions` с этим типом → 422.
- Старые обращения читаются по прежним правам (`GET /api/v2/escalations[/{id}]`), ответ
  `POST .../reply` → 403, ничего не меняется.
- Неподтверждённые черновики обращений отменяются при старте backend (и при попытке
  подтверждения → 409) с событием `escalation_retired`.
- Миграция `006` убирает `escalate_to_buddy` из `recovery_actions` открытых блокеров.

## Данные и миграции

Новые файлы: `backend/migrations/005_v3_tasks.sql`, `006_v3_retire_escalations.sql`,
`007_v3_message_origin.sql`; старые миграции не менялись. Демо-данные:
`data/seed/demo-v3.json` + `scripts/seed_v3.py` (вызывается из `seed_v2`): вымышленные
Telegram-ники наставников и одно опубликованное ТЗ buddy-a, назначенное intern-a и intern-b.

## Как проверить руками

```bash
make up   # или текущий стенд; затем
curl -s -c j -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' \
  -d '{"account_id":"intern-a"}' http://127.0.0.1:8080/api/v2/auth/demo-login
curl -s -b j http://127.0.0.1:8080/api/v3/me/mentor-contact
```

Тесты: `go test ./...` в `backend/` с `TEST_DATABASE_URL` (новые: `v3_test.go`,
`v3_stats_test.go`), `uv run pytest tests/test_contracts_v3.py`.
