# S3 · Заявка на доступ — design

Action create_access_request → Go → HTTP corporate mock с Idempotency-Key=action.id. app.actions/access_requests, corporate.access_requests. UI inline preview и /requests. Poll 5s; статус mock после 15s approved/rejected.

## Зависимости

BE-01, BE-03, BE-04, action contract. DTO: [api-contracts](../../architecture/api-contracts.md).
Хранение: [data-model](../../architecture/data-model.md), ошибки и переходы:
[state-machines](../../architecture/state-machines.md).

UI использует общий reference/tokens; loading, error, empty и forbidden обязательны.
Тесты включают позитивный путь, границы входов, чужие объекты и сбои внешних зависимостей.
