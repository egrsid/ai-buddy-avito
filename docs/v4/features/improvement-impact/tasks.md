> **Текущий результат:** [проверенный runtime/live и ограничения](../../final-acceptance-2026-11-14.md).
> Пагинация, event producers и операторский cohort harness уже поставлены; formal review отдельно.

# Эффект исправлений — tasks v4

## Текущий результат локальной интеграции

**V4-IMPACT-BE-01 / FE-01 — DONE (feature/ai-v4)**. Окно 7 дней, малые группы скрыты, свежая БД честно insufficient_data; прожитая история на отдельном стенде с тестовыми часами даёт 10/6 → 10/2 = 60% → 20%, −40 п.п. через настоящий Go API и браузер.
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
