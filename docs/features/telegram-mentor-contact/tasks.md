# Telegram вместо внутреннего обращения — tasks v3

**Факт 13.11 (ветка feature/backend-v3):** BE готов: `GET /api/v3/me/mentor-contact`, preview/export с TTL 10 мин и повторной проверкой прав, внутренние обращения отключены (V3-CONTACT-01, V3-MIGRATE-01). Открыто: FE (кнопка, копирование, empty state), AI safe summary (V3-AI-01), browser-проверки V3-T01…T03, T12. API: [backend-api](../../v3/backend-api.md).

**Факт FE 13.11:** FE готов (ветка feature/frontend-v3): `MentorContactCard` на шаге, в задании и в сайдбаре — предпросмотр текста, «Скопировать и открыть Telegram» (noopener), запрет буфера → ручное копирование, 409 → «подготовьте заново», без статуса «доставлено». Кнопка «Спросить наставника» и ответ в архиве обращений убраны. E2E: `frontend/e2e/v3-browser-mentor-loop.spec.ts`.

Задачи V3-CONTACT-01, V3-AI-01, V3-FE-01: **TODO**, владельцы/allowed directories/reviewers/dependencies/DoD
заданы в [едином backlog v3](../../v3/delivery.md). [Spec](spec.md), [design](design.md).

- [ ] BE/AI executable DTO + fixtures, FE review и TL contract gate.
- [ ] Новые миграции/seed и runtime в авторских каталогах после старта реализации.
- [ ] Реализовать spec с ACL/error/offline/version/persistence состояниями.
- [ ] Выполнить V3-T01, V3-T02, V3-T03, V3-T12, component coverage >80% и browser integration.
- [ ] Зафиксировать фактическую приёмку, не объявлять planned test или fixture готовой функцией.
