# Authorization & Privacy target v2

**Target v3:** [архитектура/DTO/ACL/переход](../v3/architecture.md),
[приёмка](../v3/testing.md). Ниже — v2 baseline; внутренний buddy send/reply не переносить
в новый интерфейс. В V3-CONTRACT-01 нужны реальные schemas/fixtures/consumer review;
проектные таблицы сами по себе не являются исполняемыми контрактами.

Версия 2.0 · обязательная часть P0, не implemented endpoints.
[Feature](../features/authorization-and-privacy/spec.md), [API](api-contracts.md).

## Сессии и граница сервера

Демо-вход POST /api/v2/auth/demo-login по account_id только APP_ENV=local/test.
Сервер создаёт 32 случайных байта сессии, хранит SHA-256 в app.sessions, cookie
buddy_session: HttpOnly, SameSite=Lax, Path=/, max-age=28800, Secure при HTTPS.
Повторный login отзывает текущую сессию, logout удаляет cookie; TTL 8h без продления.
Роли, назначения, actor и team выводятся Go из БД, не localStorage/браузера/LLM.
Все мутации, включая login/logout, проверяют точный APP_ORIGIN. Кроме login нужен
X-CSRF-Token сессии; /auth/me возвращает его в память frontend. CORS закрыт, Vite proxy.
Публичное размещение требует отдельной auth/HTTPS и отключённого demo-login; не P0 local.

## Политика доступа

Решение = role + team + resource + explicit permission + object ownership + document ACL.
Deny by default. Одинаковый 404 для чужого/несуществующего объекта, 403 для запрещённого
роли маршрута. Списки фильтруются до выдачи; знание UUID не даёт права. Team не является
автоматическим доступом ко всем документам. Право запросить DB role не равно наличию grant.

| Объект / действие | intern | buddy | access_approver | documentation_owner |
|---|---|---|---|---|
| Goal/steps/checks/history/actions | Свои; check по policy | Только выбранные поля snapshot | Нет | Нет |
| Заявка | Своя; подтвердить отправку | Нет без отдельной роли | Назначенные ресурсы; approve/reject, не свою | Нет |
| Mock IAM grant | Read через Go на свой requestable ресурс | Нет | Изменение только результатом решения Go/mock | Нет |
| Эскалация | Своя, preview/confirm | Назначенный intern и разрешённый snapshot | Нет | Нет |
| Knowledge | Собственная ACL | Собственная ACL + пересечение при handoff | Собственная ACL | Назначенные инструкции по ACL |
| Friction/candidate | Свой blocker, без списка участников | Только переданное | Нет | Safe aggregate назначенных инструкций, review |
| Публикация KB/изменение template | Нет | Нет | Нет | Отдельный human review workflow, не автоматический API |

Совмещение ролей только с отдельными scoped assignments. Базовое демо использует
раздельные approver/docs-owner. Buddy не становится владельцем ресурса по назначению.

## Тестовые субъекты и данные (target seed v2)

intern-a и intern-b команды A с buddy-a; intern-c команды B с buddy-b для отрицательных
проверок. approver-a назначен db-team-a-test; docs-owner-a назначен инструкции команды A.
Ресурсы: db-team-a-test, db-team-b-test, db-restricted. TL baseline фиксирует единственную
requestable DB capability `db_reader` у db-team-a-test; admin/write запрещены в P0.
Это synthetic capability, не SQL-роль PostgreSQL приложения. Permission codes и
explicit ACL policy приведены в [contract-baseline](contract-baseline.md). Ограниченный ресурс не выдаётся
стажёрам в базовой policy; произвольная requested_role отклоняется до создания заявки.
Документы: синтетические team A/team B, документ с explicit restricted permission,
безопасная публичная инструкция и закрытый synthetic personal-data fixture.
Закрытый fixture не передаётся AI только потому, что данные синтетические.
Имена тестовых аккаунтов — целевые; текущие 4 аккаунта seed v1 ещё не изменены.

## Permission-aware RAG

1. Go аутентифицирует и вычисляет access_scope: subject_id, team_ids, resource_permissions,
   document_permissions, policy_revision; точная общая структура в contract-baseline.md. Scope берётся из сервера, никогда из текста/клиентского JSON.
2. Внутренний аутентифицированный запрос передаёт scope Python; отсутствие/невалидность
   scope → отказ, не fallback на demo_public/all. Allowed tools/routes также задаёт Go.
3. Python применяет фильтр document/chunk ACL до retrieval/top-k и до LLM. Фрагмент,
   title, URL, metadata, count и excerpt чужого документа не попадают в prompt/ответ.
4. Python повторно проверяет retrieved refs/version/ACL перед prompt и финальным output.
   Go перед публикацией проверяет citations через scoped knowledge API; несовпадение →
   fail closed, без раскрытия контента/имён. При streaming отправляются только уже
   разрешённые материалы; отзыв scope прерывает run при обнаружении.
5. При чтении source drawer Go заново вычисляет scope, Python проверяет документ.
   Старые citations не дают права после отзыва; сохранённые source excerpts маскируются.

Prompt injection в документе/чате считается данными. System prompt не заменяет ACL.
Python не может расширить tools, изменить business state или разрешить роль. Фильтрация
применяется в mock retrieval так же, как в live vector search.

Опциональный response cache допускается только для чистого documentation QA без
истории/PII/динамического goal state и без action proposal. Ключ включает server-derived
subject, полный scope fingerprint, policy/ACL revision, index/content revision,
generation provider/model/settings, prompt/schema version и вопрос. Не делиться между
пользователями/командами, не использовать только role/team/question. Перед hit повторно
проверить текущий scope и все source refs/версии; revoked/stale/непроверяемая ACL — miss/deny
без выдачи старого текста. Partial/error не сохранять, TTL/size ограничены, cache keys/text
не логировать. Dynamic goal/step, IAM/checks/verified, заявки/diagnostics/handoff/candidate/review
не кэшируются. Cache hit помечается; для live eval кэш выключен. [AI strategy §13](../AI_ENGINEERING_STRATEGY.md).
Cache не обходит авторизацию, trusted evidence, confirmation или budget guard.

## Diagnostic handoff и privacy

Snapshot: goal/step, blocker, safe results/errors, attempted actions, permitted instruction
refs, AI hypotheses с confidence, конкретный вопрос. Go фильтрует пересечение прав intern
и buddy и показывает точный snapshot/получателя до confirm. Полная переписка, secrets,
DSN с паролем, чужие персональные данные/закрытые документы исключены. Пользовательский
вопрос/summary проходят редактирование и фильтр unsafe данных; preview отражает именно
отправляемый текст. Смена ACL/назначения требует нового preview, а не тихой отправки.

Friction хранит intern_id только внутри app для distinct-count. Candidate содержит
journey/step/error/instruction versions/count и safe гипотезу, без user IDs/имён,
сырых логов/чатов/произвольных фрагментов. Доступ к aggregate — только owner scope;
его обезличенность не делает карточку публичной. Никаких оценок личности/компетентности.

## Внутренние вызовы и safe checks

Go → Python/mock: Authorization Bearer INTERNAL_API_TOKEN, constant-time comparison,
X-Request-ID; порты только в Compose-сети. Health без token и без данных. Internal errors/X-Request-ID проходят правила
[AI integration policy](ai-integration-policy.md): 401 token, затем 400 invalid/missing UUID,
422 schema; без отражения token/невалидного header в error/logs. Go adapter
проверяет provenance/корреляцию результата, одного token/строки source недостаточно для
evidence. Публичного endpoint приёма доверенных events от браузера нет.
Mock checks используют allowlist методов/options, например ssl_mode=disable/require;
не принимают SQL/DSN/host/команды и возвращают только outcome + safe code.

Test faults не являются public tools: X-Mock-Scenario допустим только service-auth +
local/test + mock mode + явный false-by-default flag. Go не пересылает browser header и
не выполняет `[mock:...]` из чата. Live/production faults выключены; изменения тестового
окружения не дают пользователю полномочий и не относятся к провайдерным секретам.

## Лимиты, хранение, логи

JSON 64 KiB; message/question 4000 символов, summary 2000, reason 1000. В LLM до 20
последних completed сообщений текущего диалога (<=12000 символов), текущий goal/step и
до 5 разрешённых KB chunks. Safe context не включает имя/профиль, если это не нужно;
subject используется retrieval adapter, не передаётся provider без необходимости.
Token/key/cookie, тела чата, raw logs, DSN и provider payload не логируются. Audit хранит
IDs, safe тип/параметры, результат, время; diagnostic fields ограничены схемой allowlist.
Локальное synthetic demo хранится до явного reset. До персональных/публичных данных TL
утверждает retention/deletion отдельно; сбор реальных диагностических данных запрещён.

Негативная приёмка: [testing matrix](../testing/strategy.md). При невозможности проверить
ACL/подлинность результата действие/документ не выдаются и шаг не становится verified.
