# Цели с раскрываемыми подзадачами — tasks v3

**Факт 13.11 (ветка feature/backend-v3):** BE готов: `GET /api/v3/goals` — карточки целей с прогрессом из Go и стабильным курсором (V3-GOALS-BE-01). Открыто: FE-карточки с раскрытием подзадач (V3-GOALS-FE-01), V3-T15…T18 в браузере. API: [backend-api](../../v3/backend-api.md).

**Факт FE 13.11:** FE готов: «Мои цели» — карточки с прогрессом из Go, независимое раскрытие (aria-expanded, память на вкладку и аккаунт), «Показать ещё цели» по курсору, 0 шагов = 0%. E2E: `frontend/e2e/v3-browser-mentor-loop.spec.ts`.

V3-GOALS-BE-01, V3-GOALS-FE-01 — TODO. [Owner/dependencies/allowed directories/DoD](../../v3/delivery.md).

- [ ] Согласовать DTO/semantic fixtures и consumer review в V3-CONTRACT-01.
- [ ] Реализовать spec в рамках следующей компонентной задачи, не этого docs-прохода.
- [ ] Проверить V3-T15…T18, negative ACL/version/error cases и component coverage >80%.
- [ ] Предъявить фактические результаты, отделив план от работающей функции.

[Spec](spec.md), [design](design.md).
