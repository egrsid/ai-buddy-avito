# Buddy Debug Bridge — tasks

Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Исполнители/reviewers
назначены по ролям в [handoff](../../team/assignments/README.md); имена не выдумывать. [Spec](spec.md), [design](design.md).

Предусловия фичи: RP-AUTH-01, RP-BLOCKER-01, RP-CHAT-01, RP-AI-DIAG-01.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-BUDDY-01 | Snapshot validation, scoped queue/reply и persistence | Preview exact, reply atomic/idempotent, чужие обращения закрыты |
| RP-AI-DIAG-01 | Safe diagnostic summary | Есть checks/errors/attempts/refs/hypotheses/question, без секретов |
| RP-FE-03 | Buddy queue/detail и preview | Назначенный buddy отвечает, intern видит решение и recheck |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.
