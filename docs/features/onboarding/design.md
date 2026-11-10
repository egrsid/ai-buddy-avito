# S2 · План адаптации — design

GET /tasks, GET/PATCH /tasks/{id}, POST /conversations. app.tasks + conversations. UI: /onboarding и /onboarding/:taskId. Прямой PATCH без второго confirm; AI PATCH только через action.

## Зависимости

BE-01; shared contracts v1. DTO: [api-contracts](../../architecture/api-contracts.md).
Хранение: [data-model](../../architecture/data-model.md), ошибки и переходы:
[state-machines](../../architecture/state-machines.md).

UI использует общий reference/tokens; loading, error, empty и forbidden обязательны.
Тесты включают позитивный путь, границы входов, чужие объекты и сбои внешних зависимостей.
