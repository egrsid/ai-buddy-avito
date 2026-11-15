# AI-предложение уточнения ТЗ — дизайн

Контракт POST /internal/v4/revision-draft описан v4/ai schema. Go создаёт публичный RevisionProposal с owner/report/base/version/hash и фоновой generation; Python владеет prompting/guard/failover, но не сохранением ТЗ. Public changes отображают old/new/rationale и связаны с исходным report. Валидация повторяется до записи под lock; proposal revision инвалидирует stale editor.

## Исполняемые контракты

- [contracts/v4/ai.schema.json](../../../contracts/v4/ai.schema.json)
- [contracts/v4/public.schema.json](../../../contracts/v4/public.schema.json)

Позитивные и negative примеры находятся рядом со схемами. Неизвестное поле/путь,
чужой scope и stale версия не становятся разрешённой операцией. Точное состояние
и HTTP-код определяет Go; UI не выводит права из текста модели.

## Модули

- [ai-service/app/revision_draft.py](../../../ai-service/app/revision_draft.py)
- [backend/internal/api/v4.go](../../../backend/internal/api/v4.go)
- [frontend/src/v4/RevisionView.tsx](../../../frontend/src/v4/RevisionView.tsx)

Данные сохраняются через штатные миграции и business API. Ответ LLM, fixture или
healthcheck не является доказательством выполнения побочного действия.
[Поведение](spec.md) · [Проверки](tasks.md) · [Архитектура](../../../ARCHITECTURE.md).
