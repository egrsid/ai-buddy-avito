# Causal Blockers & Friction Events — tasks

Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Перед началом назначить
реального исполнителя/reviewer, не выдумывать имя. [Spec](spec.md), [design](design.md).

Предусловия фичи: RP-VERIFY-01; схемы из RP-CONTRACT-01.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-BLOCKER-01 | Go normalization, blocker reducer, friction records | Safe error persistent, dedup/correct context, recovery allowlist |
| RP-AI-01 | Классификация и объяснение | Hypothesis/confidence не подменяют evidence, invalid output безопасен |
| RP-FE-02 | Карточка ошибки и recovery | Code/причина/следующее действие/buddy видны, без raw logs |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.
