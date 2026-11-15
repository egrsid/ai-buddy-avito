# AI-предложение уточнения ТЗ — реализация и проверки

Этот файл связывает критерии [спецификации](spec.md) с реализацией и исполняемыми
проверками. Матрица не заменяет запуск тестов и не является формальным внешним approval.

- Реализация: модули и DTO из [дизайна](design.md).
- Acceptance: основной путь, отказ, ACL, версии/idempotency и сохранность результата.
- Quality gate: line coverage ≥82% независимо для Go, AI, mock и frontend.
- Источники результатов и ограничения: [отчёт покрытия](../../coverage/README.md).

| Проверяемое поведение | Файл | Проверки |
|---|---|---|
| Schema/семантика/filter/факты/injection | [test_revision_draft.py](../../../ai-service/tests/test_revision_draft.py) | test_model_input_is_filtered_before_provider / test_unsafe_model_answer_is_rejected_whole / test_change_with_invented_fact_is_dropped |
| 26 eval cases и safety | [revision_draft_evals.py](../../../ai-service/app/revision_draft_evals.py) | offline/live eval runner |
| Apply/overflow/stale editor | [v4_test.go](../../../backend/internal/api/v4_test.go) | TestRevisionApplyValidatesContentAndInvalidatesStaleEditor |
| Параллельный edit/late result | [v4_test.go](../../../backend/internal/api/v4_test.go) | TestRevisionGenerationDoesNotLockEditorAndRejectsLateResult |
| Bounded report без IDs | [v4_revision_report_test.go](../../../backend/internal/api/v4_revision_report_test.go) | TestRevisionReportIsBoundedAggregate |
| Selected apply и отдельный publish | [v4-browser-live.spec.ts](../../../frontend/e2e/v4-browser-live.spec.ts) | safe AI revision to human-published successor |

Команды запуска: [автоматические тесты](../../testing.md).
Ручное воспроизведение: [сценарии](../../verification.md).
Реальные provider calls, fake-provider tests и синтетическая история учитываются отдельно.
