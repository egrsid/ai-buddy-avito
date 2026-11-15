# Доступ к БД и проверяемая готовность — дизайн

Go владеет Goal/Step/Action/AccessRequest/Check/Evidence и транзакционным reducer. Corporate mock отдельно хранит request/approval/grant и возвращает результаты через HTTP. Python готовит только draft; React показывает Go available_actions. Graceful shutdown ожидает запросы и after-commit работу до закрытия pgx pool.

## Исполняемые контракты

- [contracts/v2/public.schema.json](../../../contracts/v2/public.schema.json)
- [contracts/v2/corporate.schema.json](../../../contracts/v2/corporate.schema.json)
- [contracts/v2/journey.schema.json](../../../contracts/v2/journey.schema.json)
- [contracts/v4/events.schema.json](../../../contracts/v4/events.schema.json)

Позитивные и negative примеры находятся рядом со схемами. Неизвестное поле/путь,
чужой scope и stale версия не становятся разрешённой операцией. Точное состояние
и HTTP-код определяет Go; UI не выводит права из текста модели.

## Модули

- [backend/internal/api/actions.go](../../../backend/internal/api/actions.go)
- [backend/internal/api/journey.go](../../../backend/internal/api/journey.go)
- [backend/internal/api/events.go](../../../backend/internal/api/events.go)
- [mock-services/corporate/service.py](../../../mock-services/corporate/service.py)

Данные сохраняются через штатные миграции и business API. Ответ LLM, fixture или
healthcheck не является доказательством выполнения побочного действия.
[Поведение](spec.md) · [Проверки](tasks.md) · [Архитектура](../../../ARCHITECTURE.md).
