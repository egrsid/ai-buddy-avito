# Контекстный AI, знания и безопасные инструменты — реализация и проверки

Этот файл связывает критерии [спецификации](spec.md) с реализацией и исполняемыми
проверками. Матрица не заменяет запуск тестов и не является формальным внешним approval.

- Реализация: модули и DTO из [дизайна](design.md).
- Acceptance: основной путь, отказ, ACL, версии/idempotency и сохранность результата.
- Quality gate: line coverage ≥82% независимо для Go, AI, mock и frontend.
- Источники результатов и ограничения: [отчёт покрытия](../../coverage/README.md).

| Проверяемое поведение | Файл | Проверки |
|---|---|---|
| Provider-input ACL, injection, sources | [test_generate.py](../../../ai-service/tests/test_generate.py) | generate behavior tests |
| Разрешённые знания и retrieval oracle | [test_retrieval_acl.py](../../../ai-service/tests/test_retrieval_acl.py) | ACL and source tests |
| Primary/secondary/partial/cancel/budget/cooldown | [test_failover.py](../../../ai-service/tests/test_failover.py) | test_started_answer_stays_and_ends_with_interruption_notice / test_budget_refusal_skips_all_further_paid_calls |
| Резервирование, parallel/restart/unknown usage | [test_budget.py](../../../ai-service/tests/test_budget.py) | test_parallel_reservations_never_exceed_stop / test_restart_keeps_spent_money |
| Retry, finish_reason, учёт и keep-warm | [test_openai_provider.py](../../../ai-service/tests/test_openai_provider.py) | test_read_failure_after_connect_is_not_retried / test_eof_after_finish_reason_is_a_complete_answer_and_settles |
| SSE/ACL/revoke и persisted origin | [api_test.go](../../../backend/internal/api/api_test.go) | TestStreams / TestRevokedSourcesDoNotEnterHistoryOrPrompt |
| Отсутствие дубликата ответа | [LiveChatPage.test.tsx](../../../frontend/src/pages/LiveChatPage.test.tsx) | stream-to-saved message tests |

Команды запуска: [автоматические тесты](../../testing.md).
Ручное воспроизведение: [сценарии](../../verification.md).
Реальные provider calls, fake-provider tests и синтетическая история учитываются отдельно.
