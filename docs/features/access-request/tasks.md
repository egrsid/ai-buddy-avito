# Controlled DB Access Request — tasks

Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Исполнители/reviewers
назначены по ролям в [handoff](../../team/assignments/README.md); имена не выдумывать. [Spec](spec.md), [design](design.md).

Предусловия фичи: RP-AUTH-01, RP-JOURNEY-01, RP-MOCK-01, RP-AI-CORE-01, RP-CHAT-01.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-ACCESS-01 | Go draft validation, confirm, reconciliation и approval ACL | Одна заявка при retry/crash, no confirm=no write, approved не равно grant |
| RP-MOCK-02 | Scoped mock decision и IAM grant | Решение отдельно, repeat key replay; delay/failure grant тестируются |
| RP-FE-02 | Preview, requests и approvals UI | Различимы submitted/approved/granted/check outcome |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.
