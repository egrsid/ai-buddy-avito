# SDD: поведение, дизайн и проверка

Спецификации описывают выбранный сценарий и supporting AI-функции текущего прототипа.
`spec.md` задаёт предусловия, правила и ожидаемые результаты; `design.md` — границы,
данные и контракты; `tasks.md` связывает реализацию с behavior/security tests.
Требования AI включают allowed tools, входной контекст, structured output,
подтверждение side effects, отказ и явное различие model/fallback.

| Функциональность | SDD |
|---|---|
| Доступ к БД и проверяемая готовность | [spec](access-journey/spec.md) · [design](access-journey/design.md) · [tasks](access-journey/tasks.md) |
| Контекстный AI, знания и безопасные инструменты | [spec](assistant/spec.md) · [design](assistant/design.md) · [tasks](assistant/tasks.md) |
| Вопрос наставнику с диагностическим контекстом | [spec](mentor-contact/spec.md) · [design](mentor-contact/design.md) · [tasks](mentor-contact/tasks.md) |
| ТЗ наставника, версии и назначения | [spec](task-briefs/spec.md) · [design](task-briefs/design.md) · [tasks](task-briefs/tasks.md) |
| Повторяющиеся затруднения и человеческий review | [spec](feedback/spec.md) · [design](feedback/design.md) · [tasks](feedback/tasks.md) |
| Рабочее пространство и лента доказательств | [spec](workspace/spec.md) · [design](workspace/design.md) · [tasks](workspace/tasks.md) |
| AI-предложение уточнения ТЗ | [spec](revision-editor/spec.md) · [design](revision-editor/design.md) · [tasks](revision-editor/tasks.md) |
| Наблюдения по версиям и проверка эффекта | [spec](impact/spec.md) · [design](impact/design.md) · [tasks](impact/tasks.md) |

## Общие инварианты

- React вызывает только Go; Python не изменяет app/corporate.
- Права проверяются до retrieval/LLM и при открытии источника/исполнении/replay.
- Preview/confirm, human approval и trusted verification — разные события.
- AI-гипотеза не является доказательством, подтверждением или публикацией.
- Все данные synthetic; метрики не являются рейтингом или доказанной экономией времени.

[Соответствие кейсу](../requirements.md) · [Архитектура](../../ARCHITECTURE.md) ·
[Проверка](../verification.md) · [Тесты и покрытие](../coverage/README.md).
