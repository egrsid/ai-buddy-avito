# Рабочее пространство и лента доказательств — дизайн

Go строит Workspace read projection из TaskAssignment, WorkspaceLink и собственного Goal. Timeline использует existing trusted events/checks/evidence, не становится вторым reducer. UI отображает title/result → state → blocker → action → evidence/AI; read не запускает проверку или запись.

## Исполняемые контракты

- [contracts/v4/public.schema.json](../../../contracts/v4/public.schema.json)
- [contracts/v4/events.schema.json](../../../contracts/v4/events.schema.json)

Позитивные и negative примеры находятся рядом со схемами. Неизвестное поле/путь,
чужой scope и stale версия не становятся разрешённой операцией. Точное состояние
и HTTP-код определяет Go; UI не выводит права из текста модели.

## Модули

- [backend/internal/api/v4.go](../../../backend/internal/api/v4.go)
- [backend/internal/api/v4_pages.go](../../../backend/internal/api/v4_pages.go)
- [frontend/src/v4/LivePages.tsx](../../../frontend/src/v4/LivePages.tsx)
- [frontend/src/v4/TimelineView.tsx](../../../frontend/src/v4/TimelineView.tsx)

Данные сохраняются через штатные миграции и business API. Ответ LLM, fixture или
healthcheck не является доказательством выполнения побочного действия.
[Поведение](spec.md) · [Проверки](tasks.md) · [Архитектура](../../../ARCHITECTURE.md).
