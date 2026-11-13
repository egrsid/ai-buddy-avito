# Engineering Readiness Journey — tasks

**Для новой разработки v3:** [Product/SDD](../../v3/README.md),
[границы и переход](../../v3/architecture.md), [задачи](../../v3/delivery.md).
Ниже сохранён baseline v2. Внутренний escalate_to_buddy/inbox/reply заменён Telegram;
добавлены versioned ТЗ и отдельные отчёты понятности, без изменения прав/verified.

13 ноября: компоненты сведены в TL, настоящий AI/Go/corporate/DB API путь прошёл;
offline browser A/B/C/restart/ACL 4 PASS и image build PASS; cold/CI/formal consumer gates отдельно. Текущие source SHA, component checks
и конкретные оставшиеся задачи — [TL record](../../team/tl-readiness.md).
Ниже исходные задачи; их checkbox не заменяет результат указанного integration review.


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
