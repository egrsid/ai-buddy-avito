> **Текущий результат:** [проверенный runtime/live и ограничения](../../final-acceptance-2026-11-14.md).
> Пагинация, event producers и операторский cohort harness уже поставлены; formal review отдельно.

# Доказательства состояния — tasks v4

## Текущий результат локальной интеграции

**V4-PROOF-BE-01 / FE-01 — DONE (feature/ai-v4)**. Собственная read-only timeline с курсором (стабильные границы, чужой курсор отклоняется), события v4 валидируются contracts/v4/events.schema.json; браузер и Go-тесты.
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
