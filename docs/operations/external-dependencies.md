# Внешние зависимости и решения

2026-11-11 · документы не создают доступы, provider keys или работающие интеграции.
[Минимальные допущения/решения TL](../team/replan-audit.md), [backlog](../team/backlog.md).

| Что | Владелец | Статус / задача | Влияние |
|---|---|---|---|
| Имена/handles пяти участников | TL | Роли/reviewers назначены в RP-TL-01; личные handles не предоставлены | Назначения по ролям действуют, handles можно добавить позднее; доступы не выдавались |
| Scoped access approver/docs-owner и policy | TL + Backend/AI | TL baseline готов в RP-CONTRACT-TL-01 | Реализовать в schemas/fixtures и подтвердить consumer review, не ждать нового устного решения |
| Docker Engine/Desktop + Compose v2 | TL | RP-INF-01; чистый запуск после bootstrap fix не подтверждён | Нужен для Compose/checkpoints, не для перепланирования docs |
| Git hosting/CI protection | Владелец + TL | Remote settings не проверены/не изменены | Только владелец публикует/настраивает; агент не меняет ветки/права/PR |
| Live LLM/provider/model/key/LLM-окружение | AI Engineer | RP-AI-02 EXTERNAL, live MVP | ai-sage/GigaChat3.5-432B-A28B; AI сам получает key/access, настраивает всю LLM-specific интеграцию/env/deps/Compose/CI и проверяет usage/TTFT. Approval TL не требуется; фактическая готовность/key/оплата не подтверждены |
| Бюджет generation + embeddings + retries | AI Engineer | RP-AI-02 TODO/EXTERNAL: реализация guard и оплата | План 1000 ₽, auto stop 800 ₽, резерв 200 ₽; AI обеспечивает оплату/контроль/ledger самостоятельно без approval TL. Не обещать число запросов или оплаченный счёт |
| Embeddings/model/dimension | AI Engineer | RP-AI-02, новая kb migration при необходимости | Cloud.ru BAAI/bge-m3 тем же разрешённым key; один index/query profile. Смена embedding provider/profile → reindex, generation/key смена — нет; actual dimension/usage/readiness проверить |
| Оригиналы кейса/созвонов/интервью/исследования | TL | RP-TL-02; есть только brief и прежний пересказ | Сверить требования к coverage/сдаче; не цитировать отсутствующий оригинал как проверенный |
| Площадка публичного demo/auth/HTTPS | TL | RP-HOST-01; не выбрана | Local offline demo — базовый P0, публичный login отдельным решением |
| PDF-презентация/видео/репетиция | TL | RP-DEMO-01 после работающего P0 | Это deliverables, не уже выполненные файлы/проверки |

Общие решения по внутреннему API и инфраструктуре уже зафиксированы в
[AI integration policy](../architecture/ai-integration-policy.md); отсутствие runtime
COPY/ingest/tests/UTF-8 пока относится к реализации, не к новому архитектурному выбору.
AI предлагает конкретные provider/model/embeddings/SDK и при необходимости source/license
внешних материалов; TL не выдумывает эти ресурсы/условия.

Cloud.ru рассматривается внутри OpenAI-совместимого адаптера `openai`, без переделки
архитектуры; API/model ID/streaming/structured outputs проверяет AI Engineer.
LLM-specific Compose/CI/root manifests/deps подключает AI Engineer сам; остальная infra — TL.
Guard/cache/profile требования и проверенные цены/оговорки — [AI strategy](../AI_ENGINEERING_STRATEGY.md).
[Физлица в Cloud.ru поддерживаются с предоплатой](https://cloud.ru/docs/billing/ug/topics/concepts__cycle_fl), доступ сервиса и платёж своей картой
AI Engineer проверяет фактически; минимальный платёж не объявлен проверенным.
Ollama необязательна, A-Vibe после MVP, прямой API Сбера — резерв без новой реализации.

Внешний live provider не включён в зависимости обязательного offline E2E/demo. Сокращение
срока не отменяет ACL/confirm/check/evidence/errors/feedback loop. Synthetic IAM, роли и
ресурсы — внутренние задачи команды, не обещанные реальные API Авито.
