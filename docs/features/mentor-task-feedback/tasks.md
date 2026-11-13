# Понятность заданий: обратная связь наставнику — tasks v3

**Факт 13.11 (ветка feature/backend-v3):** BE готов: отметки неясности, порог 2 разных стажёра за 30 дней, один отчёт на группу, ревью до resolved с опубликованной версией (V3-FRICTION-01, V3-REVIEW-01). Гипотеза (V3-AI-01, часть «task report hypothesis»): `ai-service/app/task_clarity.py` — модель с проверкой ответа (схема, число стажёров, без обвинений/рейтингов людей, секретов и инструкций) и rule-based откат; Go дописывает её в фоне. Evals `ai-service/evals/task_clarity_cases.json` (24, safety 11): без модели 24/24; GigaChat-3-Pro 21/24, безопасный текст наставнику 11/11 (`report-task-clarity-*.md`). Открыто: FE, Telegram-safe summary и «объяснение» из V3-AI-01, browser-проверки. API: [backend-api](../../v3/backend-api.md).

**Факт FE 13.11:** FE готов: у стажёра кнопка «Непонятно» с тремя причинами на каждом разделе; у наставника «Понятность заданий» — отчёт без имён, гипотеза ИИ с честной пометкой (готовится/ИИ недоступен), ревью до «Закрыть версией N». E2E: `frontend/e2e/v3-browser-mentor-loop.spec.ts`.

Задачи V3-FRICTION-01, V3-AI-01, V3-REVIEW-01, V3-FE-01: **TODO**, владельцы/allowed directories/reviewers/dependencies/DoD
заданы в [едином backlog v3](../../v3/delivery.md). [Spec](spec.md), [design](design.md).

- [ ] BE/AI executable DTO + fixtures, FE review и TL contract gate.
- [ ] Новые миграции/seed и runtime в авторских каталогах после старта реализации.
- [ ] Реализовать spec с ACL/error/offline/version/persistence состояниями.
- [ ] Выполнить V3-T06, V3-T07, V3-T08, V3-T09, V3-T10, V3-T11, component coverage >80% и browser integration.
- [ ] Зафиксировать фактическую приёмку, не объявлять planned test или fixture готовой функцией.
