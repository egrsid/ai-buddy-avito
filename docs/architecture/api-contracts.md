# API target v2 — проектный контракт

Версия 2.0 · 2026-11-11 · [TL baseline](contract-baseline.md) подготовлен.
Исполняемые BE/AI schemas, FE consumption и final review ещё требуются по
[RP-CONTRACT-01 handoff](../team/contract-handoff.md).
Сейчас реализованы только /healthz. [v1.schema.json](../../contracts/v1.schema.json) и
[examples.json](../../contracts/examples.json) — неизменённые legacy fixtures, не схема
этого API. Новые machine-readable schemas/examples будут отдельной задачей; не смешивать
task DTO v1 с Goal/Step v2. Versioned prefix /api/v2 и /internal/v2 выбран для явного
отделения нового контракта; наличие v2 URL не означает, что старый бизнес-API работает.

## Общие правила

JSON UTF-8, snake_case, UTC RFC3339. Entity IDs — UUID; account_id, team_id, resource_id,
journey_id, step_id и error_code — стабильные строковые ключи (например db-team-a-test).
Неизвестные поля входа отклоняются; 64 KiB body; текстовые лимиты в security.md.
Actor/team/roles/buddy/owner вычисляет Go. Списки {items:[...]}, в synthetic P0 <=100
объектов каждого типа, без пагинации. Success: create 201, read/update 200, no body 204.
Cookie/Origin/CSRF обязательны по [security](security.md).

Error={error:{code,message,request_id,fields?}}. Коды: 400 INVALID_JSON,
401 UNAUTHENTICATED, 403 FORBIDDEN/CSRF_INVALID, 404 NOT_FOUND,
409 VERSION_CONFLICT/IDEMPOTENCY_CONFLICT/RUN_ACTIVE/ACTION_NOT_PENDING,
410 ACTION_EXPIRED, 422 VALIDATION_ERROR/TEMPLATE_INVALID/ROLE_NOT_REQUESTABLE,
429 RATE_LIMITED, 502 UPSTREAM_ERROR/AI_SCHEMA_INVALID, 504 UPSTREAM_TIMEOUT.
Нельзя раскрывать SQL/provider payload и чужие имена/ресурсы через ошибки.

Idempotency-Key UUID обязателен для POST создания goal/run/action/check, решения approver,
ответа buddy и review. Go хранит (user,route,key,canonical_body_hash,response) 24h;
совпадение возвращает исходный status/body, иной body →409. Confirm/cancel action
идентифицируются action.id, run cancel/logout идемпотентны. Долгоживущие unique action/operation
IDs действуют и после истечения replay TTL. После 24h неизвестный write сначала сверяется,
не повторяется с новым ключом. Check/decision/reply/review требуют expected_version. Confirm/cancel используют
зафиксированную в immutable action версию и body {}; новые объекты не требуют версии
несуществующей записи. Подробные wire-правила — в contract-baseline.md.

## Public: auth, маршруты, checks

| Метод /api/v2 + путь | Вход | Выход и правило |
|---|---|---|
| POST /auth/demo-login | {account_id} | {user,csrf_token}, новая cookie local/test |
| GET /auth/me | — | {user,csrf_token}; серверные assignments |
| POST /auth/logout | — | 204, отзывает cookie |
| GET /journeys | — | Разрешённые JourneySummary[] без закрытых названий |
| POST /goals | {journey_id,journey_version} | Goal, сервер привязывает разрешённый ресурс; повтор active возвращает существующий 200 |
| GET /goals | — | Только свои Goal[] |
| GET /goals/{id} | — | Goal со steps/progress |
| GET /goals/{id}/steps/{step_id} | — | Step, evidence, blockers, safe next action |
| GET /goals/{id}/steps/{step_id}/actions | — | Только допустимые descriptors действий |
| POST /goals/{id}/steps/{step_id}/checks | {method,options,expected_version} | 201 Check, выполнение trusted adapter; 409 при старой версии |
| GET /checks/{id} | — | Только свой безопасный Check, без инфраструктурных секретов |
| GET /resources | — | Разрешённые safe resource metadata и requestable_roles |
| GET /resources/{id}/access | — | Последнее {grant_state,observed_at,stale}; новая проверка только POST check |
| GET /knowledge/{id} | — | Scoped KnowledgeDocument или одинаковый 404 |

User={id,account_id,display_name,roles[],team_id,assignments,buddy_id?}; клиент не задаёт
permissions. JourneySummary={journey_id,version,title,resource_id}. Goal={id,journey_id,
journey_version,resource_id,status,version,steps:Step[],progress:{verified,total,percent},updated_at}.
Step={id,title,description,dependencies,required_permissions,instruction_reference,
available_actions,verification_method,status,version,evidence:Evidence[],blockers:Blocker[],user_claim?}.
Статический набор полей: [journey template](journey-template.md). State — пять значений
[state machines](state-machines.md); PATCH state/done и tool update_task_status отсутствуют.
Check={id,goal_id,step_id,method,status:queued|running|passed|failed|unavailable,error_code?,
evidence_ids,observed_at?}. Options строго по методу: IAM — {}, mock_db_connection —
{ssl_mode:disable|require}, resource_policy_match — {}. Никаких SQL/DSN/host.
Evidence={id,check_id,event_id,source,method,result,observed_at,invalidated_at?,synthetic:true}.
Blocker={id,type,error_code,status:open|resolved,latest_check_id,recovery_actions[]}.
KnowledgeDocument={id,title,content,version,synthetic:true}; ACL metadata не выдаётся клиенту.

## Public: AI run, action preview/confirm

| Метод /api/v2 + путь | Вход | Выход |
|---|---|---|
| POST /conversations | {goal_id:null\|UUID,step_id:null\|string} | Свой Conversation; оба null для общего, иначе оба обязательны; 200 existing/201 new |
| GET /conversations | — | Только свои Conversation[] |
| GET /conversations/{id}/messages | — | Messages в created_at,id порядке; sources проверяются повторно |
| POST /conversations/{id}/runs | {content} или {retry_of} | 201 Run; user message + queued run атомарно |
| GET /runs/{id} | — | Run |
| GET /runs/{id}/events | Cookie, Accept:text/event-stream | Запустить queued ровно раз и подписаться |
| POST /runs/{id}/cancel | — | Терминальный Run |
| POST /actions | {conversation_id,goal_id,step_id,type,parameters} | 201 Action, только серверный validated preview |
| GET /actions/{id} | — | Action |
| POST /actions/{id}/confirm | {} | 202 executing/unknown, иначе 200 текущее состояние |
| POST /actions/{id}/cancel | {} | 200 cancelled; 409 при недопустимом terminal |

Conversation={id,goal_id,step_id,created_at}. Message={id,conversation_id,role:user|assistant,
content,status:completed|failed|cancelled|interrupted,run_id?,sources:Source[],created_at}.
Source={document_id,version,title,url,excerpt<=500}; URL только /api/v2/knowledge/{id},
разрешённый текущим scope. Run={id,conversation_id,user_message_id,assistant_message_id?,
status,error_code?,action_ids[],created_at,updated_at}. Один active на диалог, <=5 runs/min/user.

Action={id,type,goal_id,step_id,parameters,preview,expires_at,status,result?,error_code?,created_at}.
Preview вычисляет Go из разрешённого snapshot, включает resource/recipient, не свободный текст AI.
Поля actor/role/buddy/state не принимаются от LLM/браузера. Редактирование → cancel старого
и новый action, TTL 10m. «Да» в чате не является confirm конкретного action.id.

| Action type | Parameters | Result после успеха |
|---|---|---|
| create_access_request | {resource_id,requested_role,reason,additional_fields:{}} | {access_request_id}; requested_role в resource policy, intern только из сессии |
| escalate_to_buddy | {question,diagnostic_snapshot} | {escalation_id}; snapshot rebuilt/validated Go, recipient из assignment |

В P0 дополнительных свободных полей нет: additional_fields пустой объект. Расширение
обязательных полей ресурса требует синхронного schema update. Полный preview включает
инициатора, добавленного Go из сессии; user_id/role/buddy_id во входном draft отклоняются.
Контекстный safe check — явный POST кнопкой, без второго modal confirm; AI только предлагает
эту кнопку. Проверка читает synthetic состояние и регистрирует результат, не выдаёт права.

## Public: access, buddy, feedback

| Метод /api/v2 + путь | Вход | Выход / ACL |
|---|---|---|
| GET /access-requests | — | Свои AccessRequest[] |
| GET /access-requests/{id} | — | Своя заявка, last state + sync_status |
| GET /approvals | — | AccessRequest[] только назначенных approver ресурсов |
| POST /access-requests/{id}/decision | {decision:approved\|rejected,reason,expected_version} | Заявка; только scoped access_approver, не собственная |
| GET /escalations | — | Свои / назначенные buddy Escalation[] |
| GET /escalations/{id} | — | Snapshot после текущей ACL-проверки |
| POST /escalations/{id}/reply | {answer,expected_version} | Атомарные answer + resolved, assigned buddy |
| GET /friction-groups | — | Safe aggregate[] только documentation_owner scope |
| GET /knowledge-gaps | — | Scoped Candidate[] |
| GET /knowledge-gaps/{id} | — | Candidate, без участника/сырой диагностики |
| POST /knowledge-gaps/{id}/review | {decision:under_review\|accepted\|rejected\|resolved,reason,expected_version,resolved_reference?} | Candidate по state machine; resolved_reference обязателен для resolved |

AccessRequest={id,goal_id,step_id,resource_id,requested_role,reason,mock_id,status:submitted|approved|rejected,
grant_state:absent|pending|present|unknown,sync_status:ok|unavailable,version,created_at,updated_at}.
DiagnosticSnapshot={goal:{id,title},step:{id,title},blocker:{id,type,error_code},checks:[safe Check],
attempted_actions:[safe result],instruction_refs:[Source],hypotheses:[{text,confidence:low|medium|high}],question}.
Escalation={id,goal_id,step_id,blocker_id,intern:{id,display_name},buddy:{id,display_name},
diagnostic_snapshot,status:open|resolved,answer?,version,created_at,resolved_at?}.
Candidate={id,journey_id,step_id,error_code,instruction_refs:[{document_id,version}],affected_count,
hypothesis,proposed_fix,state:proposed|under_review|accepted|rejected|resolved,enrichment_status,
version,resolved_reference?,created_at,updated_at}. Aggregate не возвращает user IDs/names/chat/logs.
POST публичного создания friction/event/candidate из произвольного payload отсутствует:
это внутренний Go pipeline, пользователь может только запросить check и review.

## AI SSE

Envelope: event:<type>, id:<sequence>, data:<однострочный JSON>, пустая строка.
Sequence с 1 на run; Cache-Control:no-cache, X-Accel-Buffering:no; heartbeat `: ping` 10s.
Публичные events: run.started {run_id}; message.delta {run_id,text}; message.sources
{run_id,sources}; action.proposed {run_id,action}; run.completed {run_id,message_id};
run.failed {run_id,code,message}; run.cancelled {run_id}. Ровно одно terminal event при
живом соединении. Disconnect не гарантирует доставку: GET run/messages — истина.
Источники идут после текста, proposals — только после успешного конца upstream и commit.
Нет SSE replay; повтор GET не запускает run второй раз. Business events ниже не этот поток.

## Internal: Go → Python /internal/v2

Bearer service token, X-Request-ID, проверенная сеть. Все DTO закрыты к неизвестным полям.
POST /generate → SSE. Вход: {run_id,conversation_id,goal_context?,messages,access_scope,
allowed_journeys,allowed_tools,action_results}. Goal context содержит разрешённые goal/step,
dependencies, evidence, blockers, instruction refs и safe next actions из Go. Scope по
[security](security.md), messages <=20/12000 chars, последние <=5 safe action_results.
AI выводит run.started/message.delta/message.sources, не более одного tool.proposed
{run_id,type,parameters,goal_id,step_id}, затем generation.completed {run_id} или run.failed.
Go буферизует proposals, проверяет schema/ACL/context до публичного Action. Ошибка →
TOOL_VALIDATION_ERROR/AI_SCHEMA_INVALID, без pending actions/исполнения.

| POST internal operation | Вход в дополнение к access_scope | Структурированный ответ |
|---|---|---|
| /journey-selection | intent, allowed_journeys[] | {journey_id,version}; только из списка, либо clarification |
| /access-request-draft | goal/step, permitted_resource, allowed_roles, reason/context | {resource_id,requested_role,reason,additional_fields:{}} либо missing_fields[] |
| /classify-error | safe code + allowed_blocker_types | {blocker_type,explanation,confidence}; гипотеза, не evidence |
| /diagnostic-summary | safe goal/checks/blocker/actions/refs | DiagnosticSnapshot, без добавленных секретов/истории |
| /knowledge-gap-draft | aggregate safe context + permitted instruction refs | {hypothesis,proposed_fix,source_refs}; без IDs людей |

GET /knowledge/{id} и POST /knowledge/search получают access_scope через защищённый
внутренний запрос (для GET — X-Access-Scope: base64url UTF-8 JSON access_scope, максимум
8 KiB; для POST — поле body, никогда query из браузера), возвращают только разрешённый
документ/Source[]. Scope header доступен только аутентифицированному Go; неизвестные
поля/неверный encoding/отсутствие scope — отказ. Формальную AI schema пишет RP-CONTRACT-AI-01 с common definitions от RP-CONTRACT-BE-01. AI invalid output не исполняется: safe error,
clarification либо deterministic fallback candidate. Новый schema/fixtures — RP-CONTRACT-01.

## Internal: Go → mock /internal/v2

| Операция | Правило |
|---|---|
| GET /resources | Safe synthetic policies, Go дополнительно фильтрует по субъекту |
| POST /iam/access-checks | {check_id,subject_id,resource_id,requested_role} → correlated granted/absent result |
| POST /access-requests | {operation_key,subject_id,resource_id,requested_role,reason}; Idempotency-Key=action.id → mock_id/submitted |
| GET /access-requests/by-operation/{key} | Lookup неизвестного write; 404 не означает право создать с новым key |
| GET /access-requests/{mock_id} | Последний status/grant_state, без автоматического решения |
| POST /access-requests/{mock_id}/decision | {decision,approver_id,reason,operation_key}; проверка назначения Go + mock; отдельное обновление grant |
| POST /db/connection-checks | {check_id,subject_id,resource_id,options:{ssl_mode}} → passed/DB_SSL_REQUIRED/ACCESS_DENIED/unavailable |
| GET /checks/by-operation/{key} | Восстановление check без повторного внешнего эффекта |

Mock возвращает event_id, check/operation correlation, synthetic:true, observed_at и safe
outcome. Один key/body — тот же объект, другой body —409. Отсутствие approval не создаёт grant.
Можно детерминированно симулировать задержку grant/сбой после approve для теста, но не
скрытое одобрение. [Events](event-contracts.md) описывает trusted adapters и дедупликацию.

## Health

Текущие Go/AI/mock /healthz → {status:"ok",service} только liveness. Будущий /readyz проверяет
свою DB/миграции; наличие health не означает готовность route/IAM/RAG/feedback loop.
