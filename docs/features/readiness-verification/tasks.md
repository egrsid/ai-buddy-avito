# Proof of Readiness — tasks

13 ноября: компоненты сведены в TL, настоящий AI/Go/corporate/DB API путь прошёл;
полные browser/clean image/consumer gates открыты. Текущие source SHA, component checks
и конкретные оставшиеся задачи — [TL record](../../team/tl-readiness.md).
Ниже исходные задачи; их checkbox не заменяет результат указанного integration review.


Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Исполнители/reviewers
назначены по ролям в [handoff](../../team/assignments/README.md); имена не выдумывать. [Spec](spec.md), [design](design.md).

Предусловия фичи: RP-JOURNEY-01, RP-ACCESS-01, RP-MOCK-02.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-MOCK-03 | Safe mock DB check, error/success/delay fixtures | Нельзя передать SQL/DSN; outcomes deterministic и correlated |
| RP-VERIFY-01 | Evidence processing и state transitions | Проверены duplicate/stale/revoked/false success, technical progress persistent |
| RP-FE-02 | Evidence/check UI | Видны источник, время, ошибочный/непроверенный результат и safe retry |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.
