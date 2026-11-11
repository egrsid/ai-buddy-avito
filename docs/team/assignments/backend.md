# Назначение: Backend


Рабочая ветка **feature/backend-mvp-v2 существует на GitHub**. Проверенный head и
состояние — в [inventory](../branches.md). Текущие TL решения/границы/приемка:
[TL record](../tl-readiness.md). Первая contract поставка уже предъявлена; остаток
consumer gate и дальнейшие RP-задачи сохраняются. Чужие ветки/каталоги не менять.

## Начать с RP-CONTRACT-BE-01

Прочитать AGENTS/Before starting, [TL baseline](../../architecture/contract-baseline.md),
[API](../../architecture/api-contracts.md), [events](../../architecture/event-contracts.md),
[journey](../../architecture/journey-template.md), [handoff](../contract-handoff.md),
[AI integration policy](../../architecture/ai-integration-policy.md). В common Error добавить
INVALID_REQUEST_ID; internal HTTP fixtures, source URL и fault/timeout boundary не
придумывать независимо от AI.
Сформировать common/public/journey/events/corporate schemas и positive/negative fixtures,
shared offline validator/tests по точному списку файлов handoff. Не реализовывать v2
runtime до общего gate. AI schema пишет AI Engineer, FE проверяет consumer DTO.

Результат: локальная валидация Draft202012, refs без сети, negative cases отклоняются,
никаких двух несовместимых AccessScope/Source/State. Backend — единственный автор common
и test helper; AI сообщает требования к общим полям. Результаты передать AI/FE/TL.

## Далее по зависимостям backlog

| ID | Зона | Результат / зависимость |
|---|---|---|
| RP-DATA-BE-01 | backend/migrations/, mock-services/migrations/ | App/corporate DDL/constraints/grants, новые файлы после contract gate |
| RP-MOCK-01 | mock-services/corporate/, data/seed/, tests mock | Users/assignments/resources/IAM/seed; после DATA gate, knowledge файлы поступают от AI |
| RP-AUTH-01 | backend/ | Sessions/CSRF/Origin/scoped policy, own-object isolation |
| RP-JOURNEY-01 | backend/, data/seed/ journey JSON | Один validated template/Goal/Step/dependencies, no manual done |
| RP-CHAT-01 | backend/ | Persistent run/SSE после AI CORE, Go deadline 90s/один terminal transition, internal fault harness и Source.url validation; не ждать AI DIAG |
| RP-MOCK-02 | mock-services/ | Request/approval/reject/grant и idempotency без timer |
| RP-ACCESS-01 | backend/ | Draft/confirm/create/reconcile/approval ACL/IAM recheck |
| RP-MOCK-03 | mock-services/ | Safe DB check: SSL failure/passed/denied/unavailable |
| RP-VERIFY-01 | backend/ | Evidence correlation/reducer, version conflict, duplicate/stale/revoke tests |
| RP-BLOCKER-01 | backend/ | Нормализация error/blocker/friction, safe recovery; ошибки сохраняются при недоступности AI |
| RP-BUDDY-01 | backend/ | Snapshot intersection ACL/preview/queue/reply после AI DIAG |
| RP-REVERSE-01 | backend/ | Distinct count/unique candidate/review/fallback; AI текст — от AI DIAG |

Точные зависимости/статусы: [backlog](../backlog.md). Mock остаётся отдельным Python
сервисом и владельцем corporate; его назначение Backend не переносит бизнес-данные
в AI и не означает переписывание mock на Go. Исходный main уже относил mock к Backend.

## Границы и помощь другим

Зоны: backend/, mock-services/, data/seed/, свои contract files/tests. Shared scripts
принадлежат TL; только scripts/check_repo.py для v2 contracts — согласованное исключение.
Не менять data/knowledge/ и ai-service/ вместо AI Engineer. Согласовать UUID/refs с AI;
не переназначать старый intern-b silently. FE получает реальные API samples/errors.
Reviewer QA smoke — Backend: проверить семантику adapted v2 теста, не поручать Fullstack
покрыть все Go/mocks. Fullstack не реализует mocks/SQL/seed.

## Приёмка и проверки

Каждая бизнес-задача включает собственные happy/security/error/integration tests и coverage
>80% соответствующего Go/mock компонента. make check; component checks backend и mock,
релевантная матрица [testing](../../testing/strategy.md). Version conflict из legacy QA
не теряется: включить в RP-VERIFY-01/контрактные integration tests.
После поставки: изменённые файлы, sample requests/results, реальные команды/coverage,
известные ограничения; TL обновляет общий backlog. No fake success, real corporate API,
произвольный SQL, direct Python app write, автоматический grant от LLM.
