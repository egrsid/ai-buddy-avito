# RP-CONTRACT-01 — решения Tech Lead

2026-11-11 · TL-пакет подготовлен по прямому поручению владельца проекта.
**RP-CONTRACT-TL-01 выполнена на уровне проектирования.** Это выбранный baseline для
создания схем. Schema implementation, consumer review и финальное принятие экземпляра
контрактов ещё не выполнены; RP-CONTRACT-01 целиком остаётся IN_PROGRESS.

Прочитаны Product/Architecture/ADR, API/events, state machines, security, journey template,
legacy schema/examples и QA-работа в существующей ветке. [План передачи](../team/contract-handoff.md)
фиксирует авторов файлов, зависимости и приёмку. TL не выбирает внутренний AI framework/
prompting/retrieval вместо AI Engineer.

## 1. Зафиксированные общие решения

| Область | Решение TL для P0 |
|---|---|
| Scope | Один db-access-team-a: разрешённая цель → заявка/отдельный approval → IAM/connection evidence → blocker/buddy → два distinct interns → один candidate/human review |
| Stack/ownership | React только Go; Go app/business state; Python AI/logical knowledge в physical kb; отдельный Python corporate mock со своей corporate DB-role; разработчик mock — Backend |
| Protocol | Public /api/v2, internal /internal/v2; REST JSON + AI SSE; никакого parallel v1 product runtime и automatic DTO conversion |
| Executable legacy | v1.schema.json/examples остаются legacy до отдельно проверенного перехода; v1 test pass не принятие v2 |
| Template | Immutable version/hash, три mandatory steps select_resource/check_access/check_connection; request/confirm/approval — recovery check_access; cycles/unknown methods запрещены |
| State | unverified/ready/blocked/waiting_external/verified только Go; claims/LLM/buddy answer не technical evidence |
| Confirmation | Неизменяемый preview, TTL 10m; intern confirm отправки, отдельный approver decision, IAM grant recheck, затем DB check |
| Idempotency | UUID key для create/check/decision/reply/review, replay 24h; action ID стабилен, unique operation key дольше TTL; unknown только reconcile, не новый key |
| Privacy | Role + team + resource + document ACL + ownership, deny by default; Go scope → Python filtering до LLM, titles/metadata/citations включены |
| Trusted input | Только correlated Go policy и mock adapters; business events и AI SSE различаются; browser/LLM не post evidence |
| Feedback | journey_id + step_id + error_code, distinct intern>=2, unique candidate; один team-scoped journey/version в P0; accepted не публикует документ |
| Offline | Полный P0 без LLM key/сети после установки образов; режим mock явно виден; live provider P1, не gate старта |
| Retention | Только synthetic local data до explicit reset владельцем; реальные/публичные данные не допускаются без отдельного решения |
| Quality | Closed JSON Schema, positive/negative fixtures, all safety pass; >80% line coverage каждого business component; bootstrap не готовый продукт |

## 2. Synthetic policy, которую можно кодировать

Ниже минимальные договорённости команды для demo, не регламент Авито.

| Субъект / ресурс | Назначение |
|---|---|
| intern-a, intern-b | team-a, buddy-a; только свои goal/history/checks/actions/requests; request/check db-team-a-test |
| intern-c | team-b, buddy-b; не получает journey/ресурс/документы team-a; второй инженерный journey не добавляем в P0 |
| buddy-a / buddy-b | Только assigned intern и явно переданный safe snapshot с пересечением document ACL; без полной истории |
| approver-a | access_approver, assignment db-team-a-test; не совмещён с intern/buddy в demo, self-approval запрещён |
| docs-owner-a | documentation_owner, инструкции/агрегаты team-a; без IDs людей/raw logs/chat |
| db-team-a-test | Единственная requestable role `db_reader`; отсутствие grant не отменяет право запросить его |
| db-team-b-test | Fixture другого resource scope; недоступен intern-a/b |
| db-restricted | Не requestable стажёрами P0; названия/метаданные закрыты, подстановка ID не открывает ресурс |

DB grant `db_reader` — synthetic capability, не реальная SQL-роль внутренней PostgreSQL.
`admin`, `write`, чужой resource/actor отклоняются. Backend задаёт стабильные UUID fixtures,
AI использует эти IDs, не изобретает второй набор. Team/resource/journey/step ключи — строки,
остальные entity IDs — UUID; поле version — positive integer, policy_revision — непустая строка.

Document ACL: каждый документ synthetic и имеет explicit scope. Публичный учебный source
можно читать всем demo users; team source требует team membership и разрешение knowledge.read;
restricted source требует явного document permission в дополнение к team/resource restrictions.
Синтетический personal-data fixture недоступен intern/LLM. Разрешение на документ не выдаётся
из содержимого промпта и не подразумевается лишь ролью buddy/docs-owner.

Утверждённые permission codes P0: resource.view, access.request, access.check, access.approve,
db.check, knowledge.read, knowledge_gap.review. Ownership checks goal/history/requests и
buddy assignment применяются независимо от этих кодов. Backend определяет grants из policy,
Python получает только scope и не расширяет список. Метод iam_permission_present проверяет
DB capability db_reader, а не permission на запрос заявки.

## 3. Общие wire-правила и исключённые неоднозначности

- JSON Schema Draft 2020-12, UTF-8, snake_case, UTC RFC3339, additionalProperties=false
  для каждого object, перечислимые enums и ограниченные массивы/строки. Numeric timestamps не вводить.
- Common AccessScope: subject_id UUID, team_ids string[], resource_permissions
  [{resource_id,permissions:string[]}], document_permissions [{document_id,permissions:string[]}],
  policy_revision string. Go вычисляет scope; retrieval дополнительно применяет документные ACL.
  Public User.assignments — только безопасные scoped назначения, без чужих субъектов.
- Body <=64 KiB, GET X-Access-Scope <=8 KiB (base64url JSON); labels/ids не являются
  доверенной service identity. Только Go service-auth может передать scope Python.
- `expected_version` обязателен в check/decision/reply/review. Confirm/cancel action имеет
  body {}: контекстная версия уже зафиксирована в immutable action и проверяется Go.
  Создание новой goal/conversation/run/action не требует версии несуществующего объекта.
- Check POST принимает method/options, не outcome/state. После принятия возвращает 201 Check;
  polling возвращает queued/running/passed/failed/unavailable. DB_SSL_REQUIRED — результат
  failed, а не ошибка транспорта. Невалидный вход →422, нет прав →403/404; отказ upstream
  после принятия check отражается unavailable, без ложного технического успеха.
- Входный diagnostic_snapshot не становится доверенным доказательством: Go связывает его с
  сохранёнными checks/evidence/actions/refs, фильтрует ACL и формирует exact preview.
  При изменении получателя/состава данных нужен новый preview/confirm.
- AI draft success — {resource_id,requested_role,reason,additional_fields:{}};
  альтернативный результат — {missing_fields:[...],question}. Эти варианты mutually exclusive.
  Journey selection success — {journey_id,version}, альтернатива {clarification}.
  Actor добавляет Go, лишние actor/role/buddy/state поля отклоняются, не молча игнорируются.
- error_code/nullable optional поля явно перечисляются в schema; на JSON-границе null и
  отсутствие не считаются взаимозаменяемыми без declared oneOf. Backend/AI авторы фиксируют
  каждое такое поле в schemas и fixtures; consumer review сверяет с текстовым API.
- `source` бизнес-события задаёт trusted adapter. Check ID связывается Go с subject/resource/
  goal/step/template version; mock не получает право менять эту связь. Replay/out-of-order
  не создают второе evidence и не переписывают более новое наблюдение.
- SSE по существующему API: <=1 tool proposal/run, публичный Action только после successful
  upstream + validation + commit; REST recovery после обрыва, без автоматического replay.

Новые варианты DTO/полей, выходящие за этот baseline, автор выносит TL/потребителю как
конкретный diff схемы; не вводит скрытый default или несовместимый объект самостоятельно.

## 4. Критерий приёмки контрактного пакета

Все public/internal routes, AI structured operations, journey schema, business events и
SSE payloads имеют schema и валидные примеры. Есть negative cases: unknown properties,
invalid role/state, forbidden actor, invalid options/SQL, missing scope, wrong event source,
неполный draft, неверные IDs/version/nullability. Правила ACL/correlation/DAG/time/idempotency
не считаются доказанными JSON Schema: они покрываются последующими component tests.

Registry `$id`/`$ref` разрешается локально, без сети/ключа. Положительные examples проходят,
отрицательные действительно отклоняются, никакой broad catch с зелёным результатом.
Frontend фиксирует проверку типов/nullable/status/error/empty DTO; AI и Backend проверяют
обе стороны generate/knowledge/mock boundaries. Review evidence хранится в
[contract handoff](../team/contract-handoff.md). Пока этих результатов нет, gate закрыт.

## Дополнение по вопросам AI Engineer

[AI integration policy](ai-integration-policy.md) фиксирует дополнительные TL-решения:
internal HTTP Error/UUID, Python/Go timeout ownership и heartbeat, controlled mock faults,
канонический Source.url, schemas в образе, CI/ingest/UTF-8, live resource/dependency policy
и ручной review evals. Эти решения входят в baseline RP-CONTRACT-TL-01; реализация схем,
Docker/CI/скриптов и consumer acceptance всё ещё впереди. RP-TL-AI-01 — документационное
уточнение, не закрытие parent RP-CONTRACT-01.

## 5. Что выполнено от TL и что остаётся

Выполнено: решение по scope/границам/roles/policy/protocol/versions, назначение authors и
reviewers, files/DoD/negative scenarios, порядок интеграции и адаптация плана к QA-ветке.
Исполняемые schemas/examples/validators принадлежат Backend/AI, frontend consumption — FE;
они этим поручением не реализованы. Финальный TL review реальных схем возможен после
поставки и не помечен DONE заранее. Оригиналы кейса/бюджет/доступы не придуманы.
