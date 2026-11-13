# Архитектура, контракты и переход v2 → v3

**Предлагаемый target; schemas/migrations/runtime не изменены.** TL принимает design,
BE/AI/FE подтверждают executable contracts до реализации. Стек прежний: React → Go →
AI/kb; app/knowledge/corporate ownership сохранён. Версия продукта не равна версии API.
Для breaking изменения help flow проектируется `/api/v3`; `/api/v2` остаётся baseline v2.
Новые JSON schemas/examples/positive-negative tests — V3-CONTRACT-01, сейчас их нет.

## Сущности и границы

| Объект | Владелец | Ключевые ограничения |
|---|---|---|
| MentorContact | Go/app | mentor_id, telegram_username, revision; чтение только назначенному стажёру; synthetic seed |
| TaskBrief / TaskBriefVersion | Go/app | owner/team, stable ID; integer version/content hash; sections[].id, acceptance criteria, разрешённые refs; published immutable |
| TaskAssignment | Go/app | intern, brief/version, assigned mentor, revision; только опубликованная версия в своей области |
| TaskFriction | Go/app | assignment, section, reason, actor (из session), time; user report, не trusted check; PII-free payload |
| TaskClarityReport / Contribution / Review | Go/app | unique scoped group; distinct subject внутри app; наружу агрегат; expected_version при review |
| AI draft | Python | безопасный section/context aggregate → hypothesis/suggested wording/refs; никаких app writes |

Contact username не отправляется LLM, не хранится в агрегате и не выдаётся docs-owner.
Python никогда не получает список стажёров, полные переписки, Telegram IDs/контакты, raw logs.
Для знания ТЗ Python получает минимальный Go-validated контекст и ACL-filtered refs;
app-копия ТЗ автоматически не индексируется в kb. Telegram — переход браузера по ссылке,
без backend outbound API/bot/webhook и без чтения сообщений.

## Telegram

Go берёт контакт из assignment, не из произвольного URL клиента/AI. Из валидированного
username строится HTTPS `https://t.me/<username>` без query с текстом/секретами.
Допустим только host t.me и путь одного username; запрет javascript:, redirect URL,
произвольных внешних host и контента из профиля модели. FE открывает с noopener/noreferrer.
Telegram контакт не доказывает пересечение прав на документы, поэтому экспорт содержит
только данные, разрешённые стажёру и текущему наставнику; повторный revoke check при
подготовке/копировании. На экране preview: задача/версия/раздел, safe code, выполненные checks,
краткий вопрос, минимальные разрешённые refs. По умолчанию без сырого чата/логов/секретов.
При отсутствии/изменении контакта — понятная ошибка/обновление preview и ручная связь.
Если Telegram не установлен, HTTPS может открыться в браузере; копирование доступно отдельно.
Клик означает «открыт переход», clipboard success — «скопировано», отправку подтверждает
сам пользователь в Telegram. Внутренние Send/Escalation/Reply объекты не создаются. Подготовка контакта работает и
из собственного DB Goal без TaskAssignment: отсутствие ТЗ не лишает помощи наставника.
Preview может жить только кратковременно до TTL; долговременной очереди диагностики нет.

## Группировка и состояния

Task report group = team_id + task_owner_id + task_brief_id + task_version + section_id + reason.
Порог >=2 distinct intern за rolling 30 дней по server observed_at; один report на group.
Unique contribution (group, intern_id), обновление last_seen вместо повторного increment;
unique request/event ID и резервирование report в одной app-транзакции. Разные версии,
разделы, owners, команды и reason не смешиваются. После порога count обновляется в рамках
окна; после спада ниже 2 существующая карточка сохраняется с current/lifetime count и last_seen,
не отменяет принятое человеком решение. Повтор после rejected/resolved не открывает новый
report в той же группе; новая версия создаёт новую группу. Cross-version rollup — P1.

Reason enum baseline: requirement_unclear, outcome_unclear, acceptance_unclear.
Go проверяет section membership и владение assignment, клиент не задаёт intern/owner/count.
CHECK_UNAVAILABLE, задержка LLM/Telegram, открытие ссылки и повтор одного intern не
превращаются в ambiguity сигнал. Свободный комментарий в P0 не собирается.

TaskBrief: draft → published → archived, published edit = новый draft successor.
Report: proposed → under_review → accepted/rejected; accepted → resolved с опубликованной
successor version того же ТЗ и явным подтверждением автора. Accepted не публикует.
После смены owner/team новая область требует явной передачи полномочий, а не копирования
старого агрегата. Revoke проверяется при чтении/редактировании/publish/review/export.

## Проектируемые API/events (имена требуют executable consumer review)

| Операция | DTO и серверное правило |
|---|---|
| GET /api/v3/me/mentor-contact | display label/telegram URL/contact revision, без произвольных recipient IDs |
| POST /api/v3/mentor-contact-preview | ровно один own goal/step либо assignment/section context → безопасный preview/hash/expiry; не отправляет сообщение |
| POST /api/v3/mentor-contact-export | hash/revision → повторная ACL/assignment проверка, текст для clipboard; истёкший/изменённый preview отклоняется |
| POST /api/v3/task-briefs и draft revisions | поля ТЗ; owner из auth; save через expected_version/idempotency |
| POST .../publish, .../archive | expected_version + explicit human action; publish возвращает immutable version |
| POST /api/v3/task-assignments и .../adopt-version | разрешённый intern/version; adopt с preview/confirm, без массовой тихой миграции |
| GET /api/v3/task-assignments[/{id}] | intern только свои; mentor только assigned/owned в scope |
| POST .../{id}/frictions | section_id/reason/client request ID; actor и версия из assignment |
| GET /api/v3/task-clarity-reports[/{id}] | count/section/version/refs/hypothesis/state; без IDs людей |
| POST .../{id}/review | decision/reason/expected_version; resolved_reference для resolved |
| internal task-clarity-draft | safe aggregate + section + allowed refs; bounded validated output, deterministic offline fallback |

Все mutation routes: прежние session/Origin/CSRF/idempotency и bounds, deny by default;
чужой объект одинаково 404, stale 409, malformed 422. Preview TTL baseline 10m.
Create/update/publish schemas обязаны исключить роли/права/verified/count как клиентские поля.
Внутренние события brief_published, task_assigned, task_friction_reported,
task_clarity_threshold_reached, task_clarity_reviewed не принимаются с browser как trusted.
contact_link_clicked — необязательная UI telemetry, не доставка и не источник отчёта.

## Миграция и rollout

1. BE/AI schemas + FE parsing fixtures + negative cases → TL/consumer gate.
2. Новые SQL migrations от владельцев; старые 001… не переписываются. Default nullable
   task refs у старых DB goals, никакого приписывания v2 errors несуществующим ТЗ.
3. В v3 не предлагать/создавать escalate_to_buddy, скрыть /buddy/escalations nav/reply.
   Старые pending escalation actions отменить с audit reason; executing/unknown сверить
   по прежнему operation key, не дублировать. Данные старых обращений сохраняются read-only
   по прежнему ACL, без импорта Telegram сообщений. Точную retirement policy старого /api/v2
   утверждает contract gate; v3 запрос внутренней отправки должен fail closed, не «успех».
4. Роль buddy получает кабинет «Мои задания»/«Понятность заданий», не inbox личных обращений.
   До появления новых данных — empty state, не fixture-история. Четыре роли сохраняются.
5. v2 documentation candidates, IAM/evidence, бюджет и synthetic DB loop регрессионно защищены.
   Staged rollout/feature capability согласовать на gate, не вводить скрытый dual-write.
