# Контекстный AI, знания и безопасные инструменты — дизайн

Python владеет kb, ACL retrieval, prompting, provider и structured operations. Go владеет conversation/run/history, перепроверяет citations и proposals. SSE Python → Go → React не предоставляет клиенту доступ к внутренним AI endpoints. Live adapter использует отдельные цены моделей и единый durable ledger; embedding index/query profile должен совпадать. Keep-alive 90 с и GET /models каждые 25 с не генерируют текст.

## Исполняемые контракты

- [contracts/v2/ai.schema.json](../../../contracts/v2/ai.schema.json)
- [contracts/v2/common.schema.json](../../../contracts/v2/common.schema.json)
- [contracts/v3/ai.schema.json](../../../contracts/v3/ai.schema.json)

Позитивные и negative примеры находятся рядом со схемами. Неизвестное поле/путь,
чужой scope и stale версия не становятся разрешённой операцией. Точное состояние
и HTTP-код определяет Go; UI не выводит права из текста модели.

## Модули

- [ai-service/app/generate.py](../../../ai-service/app/generate.py)
- [ai-service/app/operations.py](../../../ai-service/app/operations.py)
- [ai-service/app/retrieval.py](../../../ai-service/app/retrieval.py)
- [ai-service/app/failover.py](../../../ai-service/app/failover.py)
- [ai-service/app/openai_provider.py](../../../ai-service/app/openai_provider.py)
- [backend/internal/api/chat.go](../../../backend/internal/api/chat.go)

Данные сохраняются через штатные миграции и business API. Ответ LLM, fixture или
healthcheck не является доказательством выполнения побочного действия.
[Поведение](spec.md) · [Проверки](tasks.md) · [Архитектура](../../../ARCHITECTURE.md).
