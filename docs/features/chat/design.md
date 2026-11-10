# S1 · Контекстный AI-чат — design

Run создаёт Go, SSE запускает queued run один раз. Python получает ограниченные messages/task/allowed_tools и отдаёт SSE. Go валидирует sources и tools, сохраняет итог. UI /chat и чат деталей задачи; Markdown без HTML.

## Зависимости

BE-01, AI-02; live качество после AI-01/03. DTO: [api-contracts](../../architecture/api-contracts.md).
Хранение: [data-model](../../architecture/data-model.md), ошибки и переходы:
[state-machines](../../architecture/state-machines.md).

UI использует общий reference/tokens; loading, error, empty и forbidden обязательны.
Тесты включают позитивный путь, границы входов, чужие объекты и сбои внешних зависимостей.
