# Authorization & Privacy — tasks

Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Перед началом назначить
реального исполнителя/reviewer, не выдумывать имя. [Spec](spec.md), [design](design.md).

Предусловия фичи: RP-CONTRACT-01, RP-DATA-01; security tests готовятся от контракта.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-AUTH-01 | Go auth, scoped policies/ownership и повторная авторизация | Сессии/CSRF и все negative access cases проходят |
| RP-AI-01 | Permission-aware retrieval и output/ref validation | Provider spy не получил запрещённые fragments/titles/PII |
| RP-QA-01 | Security/component/integration матрица | Отрицательные случаи проходят через Go/AI/mock, без обхода API |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.
