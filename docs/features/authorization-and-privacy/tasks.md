# Authorization & Privacy — tasks

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

## Локальный Backend результат · 2026-11-12

Sessions/cookie/Origin/CSRF, fresh role/resource/document ACL и own-object isolation; scoped approver, buddy и documentation_owner.
Реализация и component/API проверки находятся в Backend working tree;
[команды, покрытие и ограничения](../../team/tl-readiness.md). Задачи Backend IN_PROGRESS,
не DONE: final consumer acceptance, настоящая AI-интеграция и FE browser A/B/C еще нужны.
Knowledge/provider реализацию и UI этой поставкой не заменяли.
