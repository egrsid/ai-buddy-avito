# Повторяющиеся затруднения и человеческий review — дизайн

Go транзакционно регистрирует contributions и резервирует уникальную карточку; Python возвращает bounded hypothesis/summary. Concurrency/idempotency сохраняют одну группу/candidate. TaskClarityReport имеет отдельные версии/окна и owner. При недоступности AI данные не теряются и используется явный fallback.

## Исполняемые контракты

- [contracts/v2/public.schema.json](../../../contracts/v2/public.schema.json)
- [contracts/v2/ai.schema.json](../../../contracts/v2/ai.schema.json)
- [contracts/v3/public.schema.json](../../../contracts/v3/public.schema.json)
- [contracts/v3/ai.schema.json](../../../contracts/v3/ai.schema.json)

Позитивные и negative примеры находятся рядом со схемами. Неизвестное поле/путь,
чужой scope и stale версия не становятся разрешённой операцией. Точное состояние
и HTTP-код определяет Go; UI не выводит права из текста модели.

## Модули

- [backend/internal/api/feedback.go](../../../backend/internal/api/feedback.go)
- [backend/internal/api/v3_feedback.go](../../../backend/internal/api/v3_feedback.go)
- [backend/internal/api/v3_stats.go](../../../backend/internal/api/v3_stats.go)
- [ai-service/app/task_clarity.py](../../../ai-service/app/task_clarity.py)

Данные сохраняются через штатные миграции и business API. Ответ LLM, fixture или
healthcheck не является доказательством выполнения побочного действия.
[Поведение](spec.md) · [Проверки](tasks.md) · [Архитектура](../../../ARCHITECTURE.md).
