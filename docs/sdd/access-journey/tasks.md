# Доступ к БД и проверяемая готовность — реализация и проверки

Этот файл связывает критерии [спецификации](spec.md) с реализацией и исполняемыми
проверками. Матрица не заменяет запуск тестов и не является формальным внешним approval.

- Реализация: модули и DTO из [дизайна](design.md).
- Acceptance: основной путь, отказ, ACL, версии/idempotency и сохранность результата.
- Quality gate: line coverage ≥82% независимо для Go, AI, mock и frontend.
- Источники результатов и ограничения: [отчёт покрытия](../../coverage/README.md).

| Проверяемое поведение | Файл | Проверки |
|---|---|---|
| Заявка, approval/IAM, SSL, evidence и feedback | [api_test.go](../../../backend/internal/api/api_test.go) | TestAccessJourneyFeedback |
| Сессии, ACL, собственное approval и повторная авторизация | [api_test.go](../../../backend/internal/api/api_test.go) | TestAuthAndIsolation / TestDualRoleCannotApproveOwnRequest / TestReplayReauthorizesAction |
| Unknown, TTL, версии, revoke и unavailable | [api_test.go](../../../backend/internal/api/api_test.go) | TestActionUnknownExpiryAndVersions / TestUnavailableCorrelationAndRevoke |
| Настоящий UI-путь и restart | [demo-loop.spec.ts](../../../frontend/e2e/demo-loop.spec.ts) | A/B/C full browser loop, ACL and real service restart |
| Drain перед закрытием БД | [lifecycle_test.go](../../../backend/internal/api/lifecycle_test.go) | TestServeDrainsRequestsAndBackgroundBeforeReturning |

Команды запуска: [автоматические тесты](../../testing.md).
Ручное воспроизведение: [сценарии](../../verification.md).
Реальные provider calls, fake-provider tests и синтетическая история учитываются отдельно.
