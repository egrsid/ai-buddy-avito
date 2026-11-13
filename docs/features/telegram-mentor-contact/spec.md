# Telegram вместо внутреннего обращения — specification v3

Статус: PLANNED, runtime отсутствует. Задачи: V3-CONTACT-01, V3-AI-01, V3-FE-01.
Основание: [Product v3](../../v3/product.md), зависимости/ownership: [delivery](../../v3/delivery.md).

## Проблема и сценарий

Стажёр открывает личный диалог назначенного наставника в Telegram и отдельно копирует проверенный контекст.

Из own Goal/Step или TaskAssignment → preview → copy/open. Нет внутренней заявки/очереди/ответа и подтверждения доставки.

## Правила и ограничения

При missing contact — понятный empty state; при revoked scope/expired preview — отказ и обновление. Старые внутренние обращения сохраняются read-only по ACL, новые в v3 запрещены.

Server session/ownership/assignment/resource/document ACL обязательны до чтения/экспорта/AI.
Go управляет app, Python только предлагает, React вызывает Go. Текущие v2 schemas не
объявляются совместимыми с target v3 без executable consumer review.

## Приёмка

V3-T01, V3-T02, V3-T03, V3-T12: [полная матрица с ожидаемым результатом](../../v3/testing.md).
Критерии остаются TODO до behavior/security/component/browser evidence; >80% per component.
[Дизайн](design.md), [задачи](tasks.md).
