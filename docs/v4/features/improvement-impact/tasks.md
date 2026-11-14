# Эффект исправлений — tasks v4

## Текущий результат локальной интеграции

**V4-IMPACT-BE-01 / FE-01 — PARTIAL integrated**. Go считает экспозиции/7-day окно/suppression, FE настраивает и читает comparison. Unit oracle −40 п.п. проверен; свежая БД честно insufficient_data. Открыт операторский прожитый dataset/test-clock.

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
