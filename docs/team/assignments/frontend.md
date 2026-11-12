# Назначение: Frontend


Рабочая ветка **feature/frontend-mvp-v2 существует на GitHub**. Проверенный head и
состояние — в [inventory](../branches.md). Текущие TL решения/границы/приемка:
[TL record](../tl-readiness.md). Первая contract поставка уже предъявлена; остаток
consumer gate и дальнейшие RP-задачи сохраняются. Чужие ветки/каталоги не менять.

## Первая работа и RP-CONTRACT-FE-01

AGENTS/Before starting, Product/SDD, [TL baseline](../../architecture/contract-baseline.md),
[API/SSE](../../architecture/api-contracts.md), [contract handoff](../contract-handoff.md).
До готовности схем прочитать target DTO и дать конкретные замечания по states/errors/
nullability/empty data. После BE/AI поставки проверить actual fixtures через typed parsing
в frontend/src/contracts/ и contract tests. Проверка должна покрывать Source/Goal/Step/
Action/Check/Request/Escalation/Candidate, не только happy user DTO.

Зафиксировать замечания/результат TL; consumer review не значит, что UI уже реализован.
Перед UI изучить docs/design/ui-reference.png и [guidelines](../../design/UI_GUIDELINES.md).

## Очередь

| ID | Зависимость | Результат |
|---|---|---|
| RP-FE-01 | Принятые schemas | Goal-first layout, навигация, step/evidence/blocker, all states, responsive/keyboard; fixtures явно обозначены |
| RP-FE-02 | FE-01 и последовательные Go поставки | Journey/chat/SSE, exact preview/confirm, requests/approvals, checks/error/refresh через Go |
| RP-FE-03 | FE-02 + Go buddy/reverse | Buddy queue/detail/reply и docs-owner candidate/review, безопасные snapshots/aggregate |
| RP-E2E-01 | План от accepted contract, полный прогон после FE-03 | Настоящие browser действия A/B/C по demo, role switching/confirm/approval/recheck/review, reload и restart при помощи TL |

FE-02 подключает endpoints по готовности, не ждёт всех для начала работы. Для E2E
использовать новые browser файлы, например frontend/e2e/journey.spec.ts, access.spec.ts,
feedback.spec.ts; конкретное разбиение выбирает FE. **Не менять frontend/e2e/onboarding.spec.ts**:
этот существующий в QA-ветке файл закреплён за Fullstack и содержит только API smoke.
Полный browser E2E не перекладывается на Fullstack.

## Владение/проверки

frontend/, кроме указанного QA test; component tests/coverage >80%, browser scenarios,
UI screenshot/адаптивность/keyboard. Go/AI schemas не менять без authors/review.
No direct Python/mock/DB calls, нельзя вручную выставлять verified или менять client role.
SSE partial/unknown/timeout/error не успех; источники открываются через Go с повторной ACL.

make check, frontend component check/typecheck/build/tests; после реализации реального
пути Playwright Chromium + npm run test:e2e. Бизнес API не перехватывать в интеграционной
приёмке; fixture testing отдельно. Reload проверяется браузером; отдельный GET не заменяет
restart. Реальный restart/setup согласовать с TL без сброса данных, записать outcome.
Отчёт TL: файлы/команды/coverage, browser результат, скриншоты и ограничения. Для demo
передать TL готовый UI capture в рамках RP-E2E-01, без отдельной задачи Fullstack.
