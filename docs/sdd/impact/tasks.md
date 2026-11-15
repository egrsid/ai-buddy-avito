# Наблюдения по версиям и проверка эффекта — реализация и проверки

Этот файл связывает критерии [спецификации](spec.md) с реализацией и исполняемыми
проверками. Матрица не заменяет запуск тестов и не является формальным внешним approval.

- Реализация: модули и DTO из [дизайна](design.md).
- Acceptance: основной путь, отказ, ACL, версии/idempotency и сохранность результата.
- Quality gate: line coverage ≥82% независимо для Go, AI, mock и frontend.
- Источники результатов и ограничения: [отчёт покрытия](../../coverage/README.md).

| Проверяемое поведение | Файл | Проверки |
|---|---|---|
| Формула, границы окна и suppression | [v4_impact_test.go](../../../backend/internal/api/v4_impact_test.go) | TestImpactArithmetic |
| Local/test clock и запрет rewind | [v4_clock_test.go](../../../backend/internal/api/v4_clock_test.go) | TestSyntheticClockIsExplicitLocalAndNeverRewinds |
| Изолированный operator harness | [test_v4_cohorts.py](../../../tests/test_v4_cohorts.py) | cohort setup/oracle tests |
| Контрольная история через UI/API | [v4-cohort-operator.spec.ts](../../../frontend/e2e/v4-cohort-operator.spec.ts) | synthetic cohort comparison |

Команды запуска: [автоматические тесты](../../testing.md).
Ручное воспроизведение: [сценарии](../../verification.md).
Реальные provider calls, fake-provider tests и синтетическая история учитываются отдельно.
