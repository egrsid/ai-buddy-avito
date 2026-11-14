# Проверяемое AI-демо — tasks v4

## Текущий результат локальной интеграции

**V4-DEMO-TL-01 / E2E-FE-01 — PARTIAL; V4-LIVE-AI-01 — OPEN**. Изолированный offline Docker и 8 browser tests с реальным restart PASS. Offline AI evals 26/26, safety 12/12. Новый paid/live healthy/fault smoke не выполнялся; events/test-clock/cold CI/race остаются открыты.

[Проверки и ограничения](../../integration-review-2026-11-14.md). Порог покрытия ≥82% отдельно.
Полное соответствие spec/design и gates не объявляется; checklist ниже — критерии
полной приёмки, а не утверждение отсутствия уже работающего runtime.

Owners/reviewers/directories/dependencies —
[delivery](../../delivery.md).

- [ ] Предъявить schemas/examples и semantic negative cases в contract gate.
- [ ] Реализовать spec/design после зависимостей и без нарушения v3.
- [ ] Выполнить feature acceptance и component coverage строго >80%.
- [ ] Предъявить actual API/browser/persistence evidence, ограничения и обновлённый статус.

[Spec](spec.md), [design](design.md), [матрица](../../testing.md).
