# Внешние зависимости и решения

2026-11-11 · документы не создают доступы, provider keys или работающие интеграции.
[Минимальные допущения/решения TL](../team/replan-audit.md), [backlog](../team/backlog.md).

| Что | Владелец | Статус / задача | Влияние |
|---|---|---|---|
| Имена/handles пяти участников, reviewers | TL | Не предоставлены; RP-TL-01 | Назначить людей на существующие роли; не выдумывать |
| Scoped access approver/docs-owner и policy | TL + BE/AI | RP-TL-01, baseline в security.md | До implementation review подтвердить роли/назначения/ACL/retention |
| Docker Engine/Desktop + Compose v2 | Fullstack/QA | RP-INF-01; чистый запуск после bootstrap fix не подтверждён | Нужен для Compose/checkpoints, не для перепланирования docs |
| Git hosting/CI protection | Владелец + TL | Remote settings не проверены/не изменены | Только владелец публикует/настраивает; агент не меняет ветки/права/PR |
| Live LLM/provider/model/key/budget | TL + AI | RP-AI-02 EXTERNAL | P1; offline P0 не зависит от ключа, ключ от организаторов не предполагается |
| Embeddings/model/dimension | AI | RP-AI-02, затем отдельная migration | Не выдавать lexical mock за live pgvector |
| Оригиналы кейса/созвонов/интервью/исследования | TL | RP-TL-02; есть только brief и прежний пересказ | Сверить требования к coverage/сдаче; не цитировать отсутствующий оригинал как проверенный |
| Площадка публичного demo/auth/HTTPS | TL + Fullstack | RP-HOST-01; не выбрана | Local offline demo — базовый P0, публичный login отдельным решением |
| PDF-презентация/видео/репетиция | TL + QA | RP-DEMO-01 после работающего P0 | Это deliverables, не уже выполненные файлы/проверки |

Внешний live provider не включён в зависимости обязательного offline E2E/demo. Сокращение
срока не отменяет ACL/confirm/check/evidence/errors/feedback loop. Synthetic IAM, роли и
ресурсы — внутренние задачи команды, не обещанные реальные API Авито.
