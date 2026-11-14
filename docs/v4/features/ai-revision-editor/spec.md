# AI-редактор исправления ТЗ — specification v4

Target specification. [Текущая реализация и приёмка](../../final-acceptance-2026-11-14.md). [Product](../../product.md), [delivery](../../delivery.md).
Задачи: V4-EDIT-BE-01, V4-EDIT-AI-01, V4-EDIT-FE-01.

Автор открывает собственный task report, выбирает «Предложить уточнение» и видит
исходный раздел, безопасное наблюдение, предложенную правку и объяснение.
Недостающий срок/система/критерий превращается в вопрос автору, не выдуманное значение.
Ready changes можно выбрать поштучно; применение меняет draft, не published.
Автор вручную редактирует draft и отдельно публикует новую версию. Assignment остаётся pinned.

P0 только свой TaskBrief и исходный report той же версии. Неясность ТЗ и ошибки инструкций
не объединяются. AI не меняет stable IDs, permissions, journey, verification или refs вне
переданного allowlist. Reasoning — краткое обоснование по фактам, без внутренних рассуждений.

Видимые состояния: generating, ready, needs_input, invalid/unavailable, expired/stale,
applied_to_draft, discarded. Неуспех позволяет открыть обычный editor.
Для unknown/offline нельзя использовать метку «сгенерировано реальной моделью».

Приёмка: V4-T08–T13 в [матрице](../../testing.md).
[Design](design.md), [tasks](tasks.md).
