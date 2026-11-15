# Вопрос наставнику с диагностическим контекстом — реализация и проверки

Этот файл связывает критерии [спецификации](spec.md) с реализацией и исполняемыми
проверками. Матрица не заменяет запуск тестов и не является формальным внешним approval.

- Реализация: модули и DTO из [дизайна](design.md).
- Acceptance: основной путь, отказ, ACL, версии/idempotency и сохранность результата.
- Quality gate: line coverage ≥82% независимо для Go, AI, mock и frontend.
- Источники результатов и ограничения: [отчёт покрытия](../../coverage/README.md).

| Проверяемое поведение | Файл | Проверки |
|---|---|---|
| Точный preview/export, TTL и ACL | [v3_test.go](../../../backend/internal/api/v3_test.go) | TestMentorContactPreviewAndExport / TestContactFromAssignmentSection |
| Редакция входа и fallback | [test_contact_summary.py](../../../ai-service/tests/test_contact_summary.py) | test_model_sees_only_redacted_facts / test_service_falls_back_and_mock_never_calls_model |
| Реальная форма из шага без внутреннего обращения | [demo-loop.spec.ts](../../../frontend/e2e/demo-loop.spec.ts) | Telegram preview assertions |

Команды запуска: [автоматические тесты](../../testing.md).
Ручное воспроизведение: [сценарии](../../verification.md).
Реальные provider calls, fake-provider tests и синтетическая история учитываются отдельно.
