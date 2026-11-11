# Engineering Readiness Journey — tasks

Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Исполнители/reviewers
назначены по ролям в [handoff](../../team/assignments/README.md); имена не выдумывать. [Spec](spec.md), [design](design.md).

Предусловия фичи: RP-CONTRACT-01, RP-DATA-01, RP-AUTH-01, RP-MOCK-01.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-JOURNEY-01 | Template validator, goal persistence и dependency rules | Один DB journey стартует; invalid graph/foreign goal отвергаются |
| RP-FE-01 | Layout, goal/step/evidence/blocker states | Интерфейс соответствует reference, responsive/loading/error/empty; fixtures помечены |
| RP-FE-02 | Интеграция UI с Go | Refresh/restart сохраняют состояние, fixture не подменяет runtime |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.
