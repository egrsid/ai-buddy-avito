# Business events target v2

**Target v3:** [архитектура/DTO/ACL/переход](../v3/architecture.md),
[приёмка](../v3/testing.md). Ниже — v2 baseline; внутренний buddy send/reply не переносить
в новый интерфейс. В V3-CONTRACT-01 нужны реальные schemas/fixtures/consumer review;
проектные таблицы сами по себе не являются исполняемыми контрактами.

Проектирование · 2026-11-11. Это серверный журнал бизнес-фактов, не AI SSE transport.
Go создаёт события на основании аутентифицированных адаптеров/собственных транзакций;
брокер и публичный ingest endpoint не нужны в недельном MVP.

## Envelope и доверие

Event={id:UUID,type,schema_version:1,occurred_at:UTC,source,entity:{type,id},
correlation_id,causation_id?,payload:{...},synthetic:true}.
Source enum: go_policy, mock_iam_adapter, mock_access_adapter, mock_db_adapter,
go_buddy_workflow, go_friction_pipeline, go_knowledge_gap_review.
Принимающий Go проверяет service authentication, разрешённую операцию, event_id,
check/operation ID, subject/resource/goal/step/journey version, допустимый outcome
и актуальность. Source — атрибут проверенного adapter, не свободная строка модели.
Browser, LLM/Python, текст buddy или произвольный лог не являются trusted producer.

| Тип | Producer | Связь / минимальная safe payload |
|---|---|---|
| resource_policy_matched | go_policy | check_id, goal_id, step_id, subject_id, resource_id, policy_revision |
| resource_access_checked | mock_iam_adapter | check_id, goal_id, step_id, resource_id, subject_id, grant_state |
| access_request_created | mock_access_adapter | request_id, operation_key, resource_id, status:submitted |
| access_request_approved | mock_access_adapter | request_id, decision_id, approver_id, resource_id |
| access_request_rejected | mock_access_adapter | request_id, decision_id, safe_reason_code |
| resource_access_granted | mock_iam_adapter | check_id, subject_id, resource_id, granted_role; только после recheck |
| db_connection_check_passed | mock_db_adapter | check_id, goal_id, step_id, resource_id, safe_options |
| db_connection_check_failed | mock_db_adapter | check_id, goal_id, step_id, error_code, safe_options |
| blocker_detected | go_policy | blocker_id, goal_id, step_id, blocker_type, error_code, check_id |
| buddy_escalated | go_buddy_workflow | escalation_id, blocker_id, action_id; snapshot в scoped записи, не event payload |
| buddy_resolved | go_buddy_workflow | escalation_id, blocker_id; не означает verified |
| knowledge_gap_candidate_created | go_friction_pipeline | candidate_id, journey_id, step_id, error_code, affected_count |
| knowledge_gap_reviewed | go_knowledge_gap_review | candidate_id, review_id, decision; без публикации |

Двенадцать обязательных событий сохранены из brief; resource_policy_matched добавлен
как trusted signal проверки select_resource. Допустимые safe codes: ACCESS_MISSING,
ACCESS_DENIED, DB_SSL_REQUIRED, CHECK_UNAVAILABLE; неизвестный технический exception
нормализуется и не раскрывается. CHECK_UNAVAILABLE не доказывает дефект документации.
User IDs нужны только внутренним IAM/evidence/distinct-count, не в owner aggregate.

## Обработка

Go после mock response не доверяет произвольному status: проверяет корреляцию и при
необходимости читает authoritative state. Unique(source,event_id) и check operation_key
отсекают повтор доставки. Check result immutable, устаревшее наблюдение не переписывает
новое. Проверка без совпадающего goal/step/resource/subject/version отвергается.
Evidence + переходы + blocker/friction + app event фиксируются одной транзакцией.
Внешний mock commit и app commit не атомарны: same-key lookup/reconcile после crash.

Step verified только от verification_method своего шаблона и satisfied dependencies.
Access_request_created/approved, buddy_resolved и knowledge_gap_reviewed сами по себе
не являются evidence подключения. Для Goal нужны IAM grant recheck и passed DB check.

Friction Event — внутренний факт затруднения с journey_id/version, step_id, error_code,
blocker_type, attempt_id, outcome, instruction_id/version, intern_id и временем.
Группа journey_id + step_id + error_code; два distinct interns → один unique candidate.
Повторы событий/попыток одного человека не повышают affected_count. Не смешивать ACL scopes;
один P0 journey соответствует одной команде. Версии/расширение группировки: ADR-019.

Сырые логи, credentials, SQL, персональные данные, чаты и закрытый content запрещены в payload.
Схемы events и invalid/duplicate/out-of-order fixtures пишет Backend в RP-CONTRACT-BE-01;
текущее contracts/v1.schema.json их пока не содержит.
