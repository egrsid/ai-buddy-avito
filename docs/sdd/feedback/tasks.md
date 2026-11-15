# Повторяющиеся затруднения и человеческий review — реализация и проверки

Этот файл связывает критерии [спецификации](spec.md) с реализацией и исполняемыми
проверками. Матрица не заменяет запуск тестов и не является формальным внешним approval.

- Реализация: модули и DTO из [дизайна](design.md).
- Acceptance: основной путь, отказ, ACL, версии/idempotency и сохранность результата.
- Quality gate: line coverage ≥82% независимо для Go, AI, mock и frontend.
- Источники результатов и ограничения: [отчёт покрытия](../../coverage/README.md).

| Проверяемое поведение | Файл | Проверки |
|---|---|---|
| Два intern и один candidate | [api_test.go](../../../backend/internal/api/api_test.go) | TestAccessJourneyFeedback / TestConcurrentFrictionDedup |
| Clarity review и concurrent dedup | [v3_test.go](../../../backend/internal/api/v3_test.go) | TestTaskClarityReportFlow / TestConcurrentTaskFrictionDedup |
| Без обвинений/секретов и failover | [test_task_clarity.py](../../../ai-service/tests/test_task_clarity.py) | test_model_answer_is_rejected_when_it_breaks_report_rules / test_model_sees_section_as_data_without_secrets_or_injections |
| Разделение и ACL статистики | [v3_stats_test.go](../../../backend/internal/api/v3_stats_test.go) | TestDifficultyStatistics / TestTaskClarityStatistics |
| Review без auto-publish | [demo-loop.spec.ts](../../../frontend/e2e/demo-loop.spec.ts) | accepted candidate leaves instruction unchanged |

Команды запуска: [автоматические тесты](../../testing.md).
Ручное воспроизведение: [сценарии](../../verification.md).
Реальные provider calls, fake-provider tests и синтетическая история учитываются отдельно.
