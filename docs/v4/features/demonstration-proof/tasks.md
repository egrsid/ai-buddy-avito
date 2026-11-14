# Проверяемое AI-демо — tasks v4

## Текущий результат локальной интеграции

**V4-DEMO-TL-01 / E2E-FE-01 / LIVE-AI-01 — DONE (feature/ai-v4)**. Свежий изолированный стенд: 8/8 browser tests с настоящим restart на пяти новых проектах подряд; стенд когорт с тестовыми часами 1/1; live через Go 10/10 primary (5.24 ₽), live evals 24/26, safety served 12/12; Go race и холодная сборка без кеша выполнены.
[Итоговая приёмка](../../acceptance-2026-11-14-final.md).

[Проверки и ограничения](../../integration-review-2026-11-14.md). Порог покрытия ≥82% отдельно.
Чек-лист ниже закрыт исполняемыми проверками ветки feature/ai-v4; формальное утверждение
контрактов командой (G1 lock) — отдельное организационное решение, тестами не заменяется.

Owners/reviewers/directories/dependencies —
[delivery](../../delivery.md).

- [x] Предъявить schemas/examples и semantic negative cases в contract gate.
- [x] Реализовать spec/design после зависимостей и без нарушения v3.
- [x] Выполнить feature acceptance и component coverage строго >80%.
- [x] Предъявить actual API/browser/persistence evidence, ограничения и обновлённый статус.

[Spec](spec.md), [design](design.md), [матрица](../../testing.md).
