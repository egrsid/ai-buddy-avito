# ТЗ наставника, версии и назначения — дизайн

Go владеет TaskBrief, draft revision, immutable versions и TaskAssignment. Section/criteria IDs стабильны, ссылки и owner/team проверяются сервером. Экспозиция закреплённой версии служит входом impact, а не рейтингом сотрудника. AI может предложить изменение, но не вызвать publish.

## Исполняемые контракты

- [contracts/v3/public.schema.json](../../../contracts/v3/public.schema.json)
- [contracts/v4/public.schema.json](../../../contracts/v4/public.schema.json)

Позитивные и negative примеры находятся рядом со схемами. Неизвестное поле/путь,
чужой scope и stale версия не становятся разрешённой операцией. Точное состояние
и HTTP-код определяет Go; UI не выводит права из текста модели.

## Модули

- [backend/internal/api/v3_tasks.go](../../../backend/internal/api/v3_tasks.go)
- [backend/internal/api/v3_goals.go](../../../backend/internal/api/v3_goals.go)

Данные сохраняются через штатные миграции и business API. Ответ LLM, fixture или
healthcheck не является доказательством выполнения побочного действия.
[Поведение](spec.md) · [Проверки](tasks.md) · [Архитектура](../../../ARCHITECTURE.md).
