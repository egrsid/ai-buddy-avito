# API v1

Версия 1.0 · 2026-11-10 · контракт для реализации. На момент подготовки каркаса реализованы
только health endpoints; наличие маршрута в этом файле не означает его реализацию.
Формы DTO: [JSON Schema](../../contracts/v1.schema.json); проверяемые примеры:
[fixtures](../../contracts/examples.json). Поведение состояний: [state-machines.md](state-machines.md).

## Общие правила

Публичный prefix /api/v1, JSON UTF-8, snake_case, даты UTC RFC3339, ID UUID.
Исключения: account_id — фиксированная строка demo-login; mock_id — ACC-<UUID>.
Неизвестные поля входного DTO отклоняются. Мутации требуют Origin и CSRF по security.md.
Лимит JSON 64 KiB; входной текст ограничен по символам, не байтам. Списки MVP возвращают
{"items":[...]} без пагинации (seed ≤100 объектов каждого типа). ID и роль инициатора
сервер выводит из сессии. Удаление объектов через API вне MVP.

Успех: объект напрямую; создание 201, чтение/изменение 200, пустой ответ 204.
Ошибка: {"error":{"code":"VALIDATION_ERROR","message":"Проверьте поля",
"request_id":"<uuid>","fields":{"reason":"Обязательное поле"}}}.
fields необязательно. X-Request-ID создаёт Go и передаёт downstream; входной ID валидируется.
401 UNAUTHENTICATED, 403 FORBIDDEN/CSRF_INVALID, 404 NOT_FOUND, 409 VERSION_CONFLICT/
IDEMPOTENCY_CONFLICT/ACTION_NOT_PENDING/RUN_ACTIVE, 410 ACTION_EXPIRED,
422 VALIDATION_ERROR, 429 RATE_LIMITED, 502 UPSTREAM_ERROR, 504 UPSTREAM_TIMEOUT.
Не отдавать внутренние SQL/provider ошибки. Невалидный JSON → 400 INVALID_JSON.

Все POST создания бизнес-объектов, создания run, ответа buddy и прямое изменение задачи требуют
Idempotency-Key UUID. Go хранит (user_id, route, key, canonical body hash, resource_id/response)
24h, уникальность тройки; одновременно пришедшие запросы сериализуются.
Тот же ключ/body возвращает исходный объект с исходным status code; иной body → 409.
Confirm/cancel идентифицируются самим action_id; Idempotency-Key для них не нужен.
DELETE session и cancel run идемпотентны. После 24h frontend не повторяет неизвестный POST,
сначала читает объект. Долгоживущая уникальность action_id/operation_key сохраняется в БД.

## Public: auth и задачи

| Метод и путь | Вход | Выход / правило |
|---|---|---|
| POST /auth/demo-login | {account_id} | 200 {user,csrf_token}; устанавливает cookie |
| GET /auth/me | — | {user,csrf_token} |
| POST /auth/logout | — | 204; отзывает cookie |
| GET /tasks | — | {items:Task[],progress:{done,total,percent}} только свои; percent=floor(done*100/total), 0 при total=0 |
| GET /tasks/{id} | — | Task |
| PATCH /tasks/{id} | {status,version} | Task с version+1; прямой UI-клик — явное действие, второй confirm не нужен |
| POST /conversations | {task_id:UUID|null} | Conversation; возвращает существующий с 200 или создаёт с 201 |
| GET /conversations | — | {items:Conversation[]} только свои |
| GET /conversations/{id}/messages | — | {items:Message[]} в порядке created_at,id |
| GET /knowledge/{id} | — | KnowledgeDocument через AI; общий синтетический документ |

User={id,account_id,display_name,role:intern|buddy,team,buddy_id:UUID|null}.
Task={id,title,description,status,position,source_ids:UUID[],version,updated_at}.
Conversation={id,task_id:UUID|null,created_at}. Один общий и один на каждую задачу пользователя.
Message={id,conversation_id,role:user|assistant,content,status:completed|failed|cancelled|interrupted,
run_id:UUID|null,sources:Source[],created_at}. Source={document_id,title,url,excerpt};
url только относительный /api/v1/knowledge/{document_id}, excerpt ≤500 символов.
KnowledgeDocument={id,title,content,version,visibility:"demo_public",synthetic:true}.

## Public: чат и SSE

| Метод и путь | Вход | Выход |
|---|---|---|
| POST /conversations/{id}/runs | {content:string} ИЛИ {retry_of:UUID} | 201 Run; user message сохраняется атомарно с run |
| GET /runs/{id} | — | Run |
| GET /runs/{id}/events | cookie; Accept:text/event-stream | SSE, запускает queued run ровно один раз |
| POST /runs/{id}/cancel | — | Run в терминальном состоянии; идемпотентно |
| GET /actions/{id} | — | Action |
| POST /actions | ActionDraft | 201 Action; ручная эскалация/редактирование preview проходит ту же проверку |
| POST /actions/{id}/confirm | пустое тело | 202 Action если executing/unknown, иначе 200 Action |
| POST /actions/{id}/cancel | пустое тело | 200 Action |

Run={id,conversation_id,user_message_id,assistant_message_id:UUID|null,status,error_code:string|null,
action_ids:UUID[],created_at,updated_at}. Retry ссылается на run того же владельца и диалога.
Не более одного active run на диалог, максимум 5 запусков/минуту на пользователя → 429.
Отправка user message не меняет задачи и не исполняет tools.

SSE envelope одинаков у Python → Go и Go → frontend: event: <type>, id: <sequence>,
data: <однострочный JSON>, пустая строка. sequence начинается с 1 в пределах run.
Серверные заголовки Cache-Control:no-cache, X-Accel-Buffering:no.

| event | data | Порядок |
|---|---|---|
| run.started | {run_id} | Один раз первым |
| message.delta | {run_id,text} | 0..N |
| message.sources | {run_id,sources:Source[]} | 0..1 после текста |
| action.proposed | {run_id,action:Action} | Только Go, 0..N после валидации и успешного конца upstream |
| run.completed | {run_id,message_id} | Терминальное, после сохранения сообщения и actions |
| run.failed | {run_id,code,message} | Терминальное; частичный ответ сохраняется |
| run.cancelled | {run_id} | Терминальное при явной отмене |

Heartbeat — комментарий `: ping`, не бизнес-событие. HTTP 401/404/409 до начала потока;
после начала — run.failed. Disconnect не гарантирует доставку последнего события:
GET /runs/{id} и /messages — источник истины. Обрыв не равен успешному завершению.

Пример:
```text
event: run.started
id: 1
data: {"run_id":"30000000-0000-4000-8000-000000000001"}

event: message.delta
id: 2
data: {"run_id":"30000000-0000-4000-8000-000000000001","text":"В учебной команде MR означает merge request."}

```

## Действия

ActionDraft={conversation_id,task_id:UUID|null,type,parameters}; разрешены только типы ниже.
Action добавляет id,status,preview,expires_at,created_at,result:object|null,error_code:string|null.
preview формирует Go детерминированно из валидированных parameters; это точный снимок,
который увидит пользователь. Для эскалации buddy_id и имя получателя добавляет Go.
В type-specific result: access_request_id, escalation_id или Task соответственно.

| type | parameters | Проверка |
|---|---|---|
| create_access_request | {resource,access_level:read|write,reason} | allowlist ресурсов; reason 1..1000 |
| escalate_to_buddy | {question,summary,source_ids:UUID[]} | question 1..4000, summary 0..2000, источники разрешены |
| update_task_status | {status,version} | task_id обязателен; задача своя, version актуальна |

Отредактированный snapshot создаётся через cancel старого и POST /actions нового.
Go никогда не принимает от AI или браузера итоговый status, actor_id или buddy_id.
Промпт не является подтверждением. Формулировка в чате «да» не исполняет действие:
UI показывает отдельную кнопку подтверждения конкретного action_id.

## Public: заявки и buddy

| Метод и путь | Вход | Выход |
|---|---|---|
| GET /resources | — | {items:[{name,access_levels:[read,write]}]} |
| GET /access-requests | — | {items:AccessRequest[]} только свои, синхронизация с mock |
| GET /access-requests/{id} | — | AccessRequest |
| GET /escalations | — | {items:Escalation[]} по роли/назначению |
| GET /escalations/{id} | — | Escalation |
| POST /escalations/{id}/reply | {answer:string} | Escalation resolved, answer 1..4000 |

AccessRequest={id,task_id:UUID|null,resource,access_level,reason,mock_id,status,
sync_status:ok|unavailable,created_at,updated_at}.
Escalation={id,intern:{id,display_name},buddy:{id,display_name},task_id:UUID|null,
question,summary,source_ids,status:open|resolved,answer:string|null,created_at,resolved_at:string|null}.
Ответ не записывается в KB автоматически. Список buddy не содержит иных данных стажёра.

## Internal: Go → Python

Authorization: Bearer token, X-Request-ID обязателен. Префикс /internal/v1.

POST /generate, Accept:text/event-stream, вход GenerateRequest:
{run_id,user:{id,team},conversation_id,task:{id,title,description,status}|null,
messages:[{role:user|assistant,content}],allowed_tools:[...],action_results:ActionResult[],knowledge_scope:"demo_public"}.
messages содержит текущий user message последним; история ограничена security.md.
allowed_tools определяет Go; Python не расширяет его. Текущие статусы передаёт Go.
ActionResult={action_id,type,status:succeeded|failed|unknown,result:object|null,error_code:string|null}.
Go передаёт максимум 5 последних результатов текущего диалога; result формируется сервером
и содержит только публичные поля результата. Пустой список допустим. Суммарные лимиты
контекста проверяет Go, JSON Schema не проверяет сумму длин элементов массива.

Python выдаёт run.started, message.delta, message.sources, затем 0..N tool.proposed
с {run_id,type,parameters,task_id}, затем generation.completed {run_id}.
Либо run.failed {run_id,code,message}. Он не выдаёт публичный Action и message_id.
Go буферизует proposals до generation.completed, валидирует, сохраняет assistant/actions
и только затем выдаёт публичные action.proposed и run.completed. Невалидный tool →
run.failed TOOL_VALIDATION_ERROR без исполнения и публикации pending actions.
Инструмент может быть предложен один раз за run (MVP: максимум одно бизнес-действие).
Для объяснения результата не запускается автономный следующий tool: новый user run получает
последние action_results. После confirm UI показывает фактический результат Go сразу.

GET /knowledge/{id} → KnowledgeDocument, 404 при отсутствии/иной visibility.
Индексация — offline CLI владельца AI; endpoint загрузки для пользователя не нужен.

## Internal: Go → mock corporate

GET /internal/v1/resources → список allowlist: sandbox/backend и sandbox/restricted, уровни read/write.
POST /internal/v1/access-requests, Idempotency-Key=action.id:
{initiator_id,resource,access_level,reason} → 201 {mock_id,operation_key,status,created_at,updated_at}.
Повтор того же payload/key → 200 с тем же объектом, несовпадение → 409 IDEMPOTENCY_CONFLICT.
GET /internal/v1/access-requests/by-operation/{key} → тот же объект или 404.
GET /internal/v1/access-requests/{mock_id} → тот же объект, с вычислением demo-статуса через 15s.
Состояния и восстановление: state-machines.md. Не добавлять endpoint реальной выдачи доступа.

## Health и готовность

Go /healthz, AI/mock /healthz → {status:"ok",service}; liveness, без проверки зависимостей.
В будущих DB-фичах /readyz должен проверять свою БД и версию миграций; не возвращать ready
только по доступности процесса. Каркас пока /readyz не предоставляет.
