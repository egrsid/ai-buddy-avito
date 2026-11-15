# ТЗ наставника, версии и назначения — реализация и проверки

Этот файл связывает критерии [спецификации](spec.md) с реализацией и исполняемыми
проверками. Матрица не заменяет запуск тестов и не является формальным внешним approval.

- Реализация: модули и DTO из [дизайна](design.md).
- Acceptance: основной путь, отказ, ACL, версии/idempotency и сохранность результата.
- Quality gate: line coverage ≥82% независимо для Go, AI, mock и frontend.
- Источники результатов и ограничения: [отчёт покрытия](../../coverage/README.md).

| Проверяемое поведение | Файл | Проверки |
|---|---|---|
| Полный lifecycle и pinned assignment | [v3_test.go](../../../backend/internal/api/v3_test.go) | TestTaskBriefLifecycle |
| Явный successor и окно истории | [v3_test.go](../../../backend/internal/api/v3_test.go) | TestAssignmentSuccessorPreviewAndWindowDecay |
| Replay с актуальной авторизацией | [v3_test.go](../../../backend/internal/api/v3_test.go) | TestTaskReplaysReauthorize |
| Publish после AI apply через UI | [v4-browser-live.spec.ts](../../../frontend/e2e/v4-browser-live.spec.ts) | human-published successor |

Команды запуска: [автоматические тесты](../../testing.md).
Ручное воспроизведение: [сценарии](../../verification.md).
Реальные provider calls, fake-provider tests и синтетическая история учитываются отдельно.
