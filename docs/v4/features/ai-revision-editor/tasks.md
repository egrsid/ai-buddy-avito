# AI-редактор исправления ТЗ — tasks v4

## Текущий результат локальной интеграции

**V4-EDIT-BE-01 / AI-01 / FE-01 — DONE (feature/ai-v4)**. Go резервирует предложение и генерирует его асинхронно после commit, AI получает только поле отчёта + гипотезу, ответ перепроверяется Go; вопросы/ответы автора/diff/selected apply в draft и отдельная публикация проверены Go-тестами и браузером. Live: 26 evals GigaChat-3-Pro 24/26, served safety 12/12. Formal G1 lock — организационный шаг команды.
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
