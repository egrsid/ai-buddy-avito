> **Текущий результат:** [проверенный runtime/live и ограничения](../../final-acceptance-2026-11-14.md).
> Пагинация, event producers и операторский cohort harness уже поставлены; formal review отдельно.

# Единое рабочее пространство — tasks v4

UX-приёмка по замечаниям владельца: [текущий результат](../../ux-release-2026-11-14.md).
«Задания и цели» объясняет назначение и показывает авторский DB-выбор после refresh.
DB-цель добавляется явно к конкретному назначению; выдача доступа остаётся отдельной.

## Текущий результат локальной интеграции

**V4-WORK-BE-01 / FE-01 — PARTIAL integrated**. Настоящие список/preview/confirm и разрешение template автором, ACL и reuse journey проверены API/browser. Открыты cursor pagination и полная приёмка дизайна.

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
