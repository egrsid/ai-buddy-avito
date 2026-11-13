# Reverse Onboarding — tasks

13 ноября: компоненты сведены в TL, настоящий AI/Go/corporate/DB API путь прошёл;
полные browser/clean image/consumer gates открыты. Текущие source SHA, component checks
и конкретные оставшиеся задачи — [TL record](../../team/tl-readiness.md).
Ниже исходные задачи; их checkbox не заменяет результат указанного integration review.


Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Исполнители/reviewers
назначены по ролям в [handoff](../../team/assignments/README.md); имена не выдумывать. [Spec](spec.md), [design](design.md).

Предусловия фичи: RP-BLOCKER-01, RP-AUTH-01, RP-AI-DIAG-01; synthetic intern-a/intern-b из RP-MOCK-01.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-REVERSE-01 | Grouping/distinct/dedup/candidate/review | Порог 2, единственная карточка, human state machine, safe fallback |
| RP-AI-DIAG-01 | Candidate hypothesis/fix draft | Наблюдение отделено от гипотезы, только разрешённые refs |
| RP-FE-03 | Owner queue/card/review | Count/error/instruction/hypothesis и решения доступны scoped owner |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.
