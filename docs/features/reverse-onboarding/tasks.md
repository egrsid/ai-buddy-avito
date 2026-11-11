# Reverse Onboarding — tasks

Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Перед началом назначить
реального исполнителя/reviewer, не выдумывать имя. [Spec](spec.md), [design](design.md).

Предусловия фичи: RP-BLOCKER-01, RP-AUTH-01; synthetic intern-a/intern-b из RP-MOCK-01.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-REVERSE-01 | Grouping/distinct/dedup/candidate/review | Порог 2, единственная карточка, human state machine, safe fallback |
| RP-AI-01 | Candidate hypothesis/fix draft | Наблюдение отделено от гипотезы, только разрешённые refs |
| RP-FE-03 | Owner queue/card/review | Count/error/instruction/hypothesis и решения доступны scoped owner |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.
