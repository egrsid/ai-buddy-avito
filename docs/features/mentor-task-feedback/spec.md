# Понятность заданий: обратная связь наставнику — specification v3

Статус: PLANNED, runtime отсутствует. Задачи: V3-FRICTION-01, V3-AI-01, V3-REVIEW-01, V3-FE-01.
Основание: [Product v3](../../v3/product.md), зависимости/ownership: [delivery](../../v3/delivery.md).

## Проблема и сценарий

Наставник получает отчёт о повторяющейся неясности конкретного места в своём ТЗ и может его улучшить.

Первый intern указывает section/reason → повтор не повышает порог → второй distinct same scope/version/section/reason за 30 дней → один report → human review → новый draft/publish → resolved reference.

## Правила и ограничения

DB error и пользовательская неясность — разные типы доказательств. Report не обвиняет наставника и не является HR-оценкой. Нет IDs/списка стажёров, raw chats/PII/Telegram; при count=2 не обещается абсолютная анонимность.

Server session/ownership/assignment/resource/document ACL обязательны до чтения/экспорта/AI.
Go управляет app, Python только предлагает, React вызывает Go. Текущие v2 schemas не
объявляются совместимыми с target v3 без executable consumer review.

## Приёмка

V3-T06, V3-T07, V3-T08, V3-T09, V3-T10, V3-T11: [полная матрица с ожидаемым результатом](../../v3/testing.md).
Критерии остаются TODO до behavior/security/component/browser evidence; >80% per component.
[Дизайн](design.md), [задачи](tasks.md).
