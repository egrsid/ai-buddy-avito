> **Текущий результат:** [проверенный runtime/live и ограничения](../../final-acceptance-2026-11-14.md).
> Пагинация, event producers и операторский cohort harness уже поставлены; formal review отдельно.

# Единое рабочее пространство — tasks v4

UX-приёмка по замечаниям владельца: [текущий результат](../../ux-release-2026-11-14.md).
«Задания и цели» объясняет назначение и показывает авторский DB-выбор после refresh.
DB-цель добавляется явно к конкретному назначению; выдача доступа остаётся отдельной.

## Текущий результат локальной интеграции

**V4-WORK-BE-01 / FE-01 — DONE (feature/ai-v4)**. Список с курсором, разрешение template наставником, preview/confirm, ACL и повторное использование пройденного journey; 390px/клавиатура в браузерном тесте.
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
