# Наблюдения по версиям и проверка эффекта — дизайн

Go владеет exposure/contribution events, impact config и арифметикой. Python не генерирует проценты/ROI и не интерпретирует причинность. Operator harness создаёт 20 участников/две версии через business API на отдельном volume, затем проводит полное H-окно на синтетических часах. Rewind и публичный clock setter запрещены.

## Исполняемые контракты

- [contracts/v4/public.schema.json](../../../contracts/v4/public.schema.json)
- [contracts/v4/events.schema.json](../../../contracts/v4/events.schema.json)

Позитивные и negative примеры находятся рядом со схемами. Неизвестное поле/путь,
чужой scope и stale версия не становятся разрешённой операцией. Точное состояние
и HTTP-код определяет Go; UI не выводит права из текста модели.

## Модули

- [backend/internal/api/v4_impact.go](../../../backend/internal/api/v4_impact.go)
- [backend/internal/api/v4_clock.go](../../../backend/internal/api/v4_clock.go)
- [scripts/v4_cohorts.py](../../../scripts/v4_cohorts.py)
- [frontend/src/v4/ImpactView.tsx](../../../frontend/src/v4/ImpactView.tsx)

Данные сохраняются через штатные миграции и business API. Ответ LLM, fixture или
healthcheck не является доказательством выполнения побочного действия.
[Поведение](spec.md) · [Проверки](tasks.md) · [Архитектура](../../../ARCHITECTURE.md).
