# S4 · Вопрос наставнику — design

Action escalate_to_buddy → Go app transaction; назначение берётся из users. GET escalations фильтруется сервером. POST reply с idempotency key, resolved terminal. UI /buddy/escalations и /buddy/escalations/:id; у стажёра карточка результата в чате.

## Зависимости

BE-01, BE-03, action contract. DTO: [api-contracts](../../architecture/api-contracts.md).
Хранение: [data-model](../../architecture/data-model.md), ошибки и переходы:
[state-machines](../../architecture/state-machines.md).

UI использует общий reference/tokens; loading, error, empty и forbidden обязательны.
Тесты включают позитивный путь, границы входов, чужие объекты и сбои внешних зависимостей.
