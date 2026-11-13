# Реальные ответы LLM и управляемый fallback — specification v3

PLANNED, не реализовано. Задачи V3-LLM-DIAG-01, V3-LLM-LIVE-01, V3-LLM-OBS-01.
[Общий план](../../v3/delivery.md), [Product](../../v3/product.md).

В live-режиме штатный ответ должен приходить от основной реальной модели. Резервная
реальная модель применяется при отказе основной до начала ответа; offline шаблон — при
недоступности live chain или отказе budget guard. Fallback не удалять и не маскировать.
Цепочка остаётся GigaChat/GigaChat-3-Pro → ai-sage/GigaChat3.5-432B-A28B → offline.
Использовать проверенные API ID, не угадывать ID по маркетинговому названию «3.5 Pro».

Разделить явные launch profiles: offline для CI/репетиции без ключа и live для проверки LLM.
В интерфейсе источник данных (Fixtures/Go API) и источник ответа (primary/secondary/offline)
— разные признаки. Live launch не должен молча наследовать mock/key-empty overlay.
При ошибочной live конфигурации — понятная readiness/config ошибка до платного вызова;
при runtime ошибке — действующий fallback с уведомлением и Telegram-контактом наставника.
Режим mock не сообщает о выдуманной ошибке LLM и не помечается «ответ реальной модели».

Успешный прогон: 10 последовательных synthetic live запросов на согласованном healthy
endpoint, каждый даёт проверенный primary response без offline fallback, содержит допустимые
источники и соблюдает сроки. Это smoke gate, не оценка production SLA/p95. Второй прогон
fault cases отдельно показывает secondary/offline, восстановление после cooldown, бюджет,
обрыв и отмену. Acceptance не засчитывается по одной строке LLM_MODE=live или HTTP 200.
Не увеличивать таймауты, не обходить budget guard и не стирать ledger ради зелёного отчёта.

## Приёмка

V3-T19…T24: [матрица](../../v3/testing.md), плюс релевантная v2/v3 регрессия.
[Design](design.md), [tasks](tasks.md).
