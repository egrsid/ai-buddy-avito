# Authorization & Privacy — tasks

13 ноября: компоненты сведены в TL, настоящий AI/Go/corporate/DB API путь прошёл;
полные browser/clean image/consumer gates открыты. Текущие source SHA, component checks
и конкретные оставшиеся задачи — [TL record](../../team/tl-readiness.md).
Ниже исходные задачи; их checkbox не заменяет результат указанного integration review.


Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Исполнители/reviewers
назначены по ролям в [handoff](../../team/assignments/README.md); имена не выдумывать. [Spec](spec.md), [design](design.md).

Предусловия фичи: RP-CONTRACT-01, RP-DATA-01; security tests готовятся от контракта.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-AUTH-01 | Go auth, scoped policies/ownership и повторная авторизация | Сессии/CSRF и все negative access cases проходят |
| RP-AI-CORE-01 | Permission-aware retrieval и output/ref validation | Provider spy не получил запрещённые fragments/titles/PII |
| RP-QA-01 | Только два API smoke (Fullstack), существующая QA-ветка | Goal ownership/reread и 401/CSRF; полная security матрица остаётся авторам компонентов |
| RP-E2E-01 | Browser role/security scenarios (Frontend) | Настоящие UI-действия/изоляция, без подмены API |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.
