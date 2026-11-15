# Рабочее пространство и лента доказательств — реализация и проверки

Этот файл связывает критерии [спецификации](spec.md) с реализацией и исполняемыми
проверками. Матрица не заменяет запуск тестов и не является формальным внешним approval.

- Реализация: модули и DTO из [дизайна](design.md).
- Acceptance: основной путь, отказ, ACL, версии/idempotency и сохранность результата.
- Quality gate: line coverage ≥82% независимо для Go, AI, mock и frontend.
- Источники результатов и ограничения: [отчёт покрытия](../../coverage/README.md).

| Проверяемое поведение | Файл | Проверки |
|---|---|---|
| Связь и чтение timeline | [v4_test.go](../../../backend/internal/api/v4_test.go) | TestV4WorkspaceTimelineAndRevision |
| Pagination/snapshot/cutoff | [v4_pages_test.go](../../../backend/internal/api/v4_pages_test.go) | TestWorkspacePagesFreezeMembershipAndRejectForeignCursor / TestTimelinePagesUseReceiptCutoffAndStableTies |
| Revoke при чтении/replay | [v4_test.go](../../../backend/internal/api/v4_test.go) | TestTimelineAndReplayDenyRevokedScope |
| Состояние панели и роли | [LivePages.test.tsx](../../../frontend/src/v4/LivePages.test.tsx) | route list/user choice tests |
| 390px, Enter и реальные API | [v4-browser-live.spec.ts](../../../frontend/e2e/v4-browser-live.spec.ts) | workspace and evidence browser scenario |

Команды запуска: [автоматические тесты](../../testing.md).
Ручное воспроизведение: [сценарии](../../verification.md).
Реальные provider calls, fake-provider tests и синтетическая история учитываются отдельно.
