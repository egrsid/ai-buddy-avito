# Вопрос наставнику с диагностическим контекстом — дизайн

Go формирует filtered snapshot и хранит preview; Python contact_summary возвращает текст либо fallback. Ссылка на Telegram принадлежит назначенному synthetic buddy. UI раскрывает форму и переносит фокус. Интеграции с Telegram API/ботом и чтения личных диалогов нет.

## Исполняемые контракты

- [contracts/v3/public.schema.json](../../../contracts/v3/public.schema.json)
- [contracts/v3/ai.schema.json](../../../contracts/v3/ai.schema.json)

Позитивные и negative примеры находятся рядом со схемами. Неизвестное поле/путь,
чужой scope и stale версия не становятся разрешённой операцией. Точное состояние
и HTTP-код определяет Go; UI не выводит права из текста модели.

## Модули

- [backend/internal/api/v3_contact.go](../../../backend/internal/api/v3_contact.go)
- [ai-service/app/contact_summary.py](../../../ai-service/app/contact_summary.py)

Данные сохраняются через штатные миграции и business API. Ответ LLM, fixture или
healthcheck не является доказательством выполнения побочного действия.
[Поведение](spec.md) · [Проверки](tasks.md) · [Архитектура](../../../ARCHITECTURE.md).
