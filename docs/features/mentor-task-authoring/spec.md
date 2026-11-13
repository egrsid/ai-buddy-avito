# Редактор и версии ТЗ наставника — specification v3

Статус: PLANNED, runtime отсутствует. Задачи: V3-TASK-01, V3-DATA-01, V3-FE-01.
Основание: [Product v3](../../v3/product.md), зависимости/ownership: [delivery](../../v3/delivery.md).

## Проблема и сценарий

Наставник сам уточняет задания, которые даёт стажёрам, и публикует новую версию.

Создать draft → редактировать цель/sections/result/criteria/refs → publish → assign. Published immutable; новый текст — successor draft, старые назначения закреплены за старой версией.

## Правила и ограничения

Чужое ТЗ/стажёр запрещены; stale update/publish → conflict. Adopt новой версии только явным preview/confirm; ни новая версия, ни человеческий комментарий не делают Goal verified.

Server session/ownership/assignment/resource/document ACL обязательны до чтения/экспорта/AI.
Go управляет app, Python только предлагает, React вызывает Go. Текущие v2 schemas не
объявляются совместимыми с target v3 без executable consumer review.

## Приёмка

V3-T04, V3-T05, V3-T11: [полная матрица с ожидаемым результатом](../../v3/testing.md).
Критерии остаются TODO до behavior/security/component/browser evidence; >80% per component.
[Дизайн](design.md), [задачи](tasks.md).
