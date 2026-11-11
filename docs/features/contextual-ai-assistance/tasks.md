# Contextual AI Assistance — tasks

Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Перед началом назначить
реального исполнителя/reviewer, не выдумывать имя. [Spec](spec.md), [design](design.md).

Предусловия фичи: RP-CONTRACT-01, RP-AUTH-01, RP-JOURNEY-01; live только RP-AI-02.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-AI-01 | Offline structured operations, secure retrieval, >=20 evals | Fallback закрывает весь P0, all safety pass, forbidden input отсутствует |
| RP-CHAT-01 | Go history/run/SSE и validation | Disconnect/cancel/retry/invalid output корректны и persistent |
| RP-FE-02 | Контекстный чат и action previews | Ожидание/partial/error/source drawer работают через Go |
| RP-AI-02 | Live provider/embeddings spike | Отдельный отчёт качества/cost, не блокирует offline P0 |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.
