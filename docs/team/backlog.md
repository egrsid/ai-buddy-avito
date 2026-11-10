# Стартовый backlog

Статусы: READY — можно брать после назначения человека; TODO — ждёт зависимости;
EXTERNAL — нужен ресурс/решение вне репозитория. Наличие спецификации не означает DONE.
Каркас запуска и документы созданы; продуктовые задачи ниже не реализованы.

| ID | Владелец | Статус | Зависимости | Результат и приёмка |
|---|---|---|---|---|
| TL-01 | TL | READY | — | Назначить имена/handles в working-agreements; дать доступы репозитория/PR/CI; опубликовать общую базу документов |
| TL-02 | TL | EXTERNAL | — | Приложить ссылку на оригинальные требования/интервью; сверить coverage и комплект сдачи |
| INF-01 | Infra | READY | Docker у исполнителя | На чистом окружении make up, migrate, seed, smoke; проверить DB role isolation и записать результат |
| INF-02 | TL/Infra | READY | TL-01 | Включить CI и protection main с обязательными jobs, без прямого push |
| BE-01 | Backend | READY | Согласованные v1 contracts | Реализовать demo-login/me/logout, сессии/CSRF, негативные проверки второй пары |
| BE-02 | Backend | TODO | BE-01 | Реализовать S2 API/DB, version conflict; сохранение статуса после рестарта |
| FE-01 | Frontend | READY | v1 DTO + reference | Layout/навигация/Task UI на contracts fixtures; все loading/error/empty states |
| FE-02 | Frontend | TODO | BE-01, BE-02, FE-01 | Реальный S2 через Go, переключение аккаунта через server login |
| QA-01 | QA | READY | v1 contracts | Подготовить E2E S2 и тесты RBAC, стартовать до integration checkpoint M1 |
| AI-01 | AI | EXTERNAL | Доступ и бюджет от TL | Spike live LLM+embeddings: provider/model, tool calling, streaming, стоимость, ключ доступен; новую размерность закрепить миграцией |
| AI-02 | AI | READY | v1 contract | Реализовать mock generate/knowledge, cancel/error fixtures, schema validation; без сетевых вызовов CI |
| AI-03 | AI | TODO | AI-01 | Реальный ingest/RAG и live adapter, evals >=20, отчёт top-5/safety/cost |
| BE-03 | Backend | TODO | BE-01, AI-02 | Runs/history/SSE, disconnect/retry/cancel, сохранение частичного ответа |
| FE-03 | Frontend | TODO | FE-02, BE-03 | Общий и task chat, SSE, источники, action preview/confirm/cancel |
| BE-04 | Backend | TODO | BE-01 | Реализовать persistent corporate mock API по v1, same-key replay и 15s status |
| BE-05 | Backend | TODO | BE-03, BE-04 | Action state machine/reconciler, S3 result persistence; crash-after-create не даёт дубль |
| BE-06 | Backend | TODO | BE-01, BE-03 | S4 escalation snapshot, scoped queue/reply + atomic resolved |
| FE-04 | Frontend | TODO | BE-05, BE-06, FE-03 | Заявки/статусы и buddy очередь/ответ; polling 5s, terminal/unknown states |
| QA-02 | QA | TODO | S1–S4 API/UI | E2E всего пути, отрицательные доступы, повтор confirm, upstream failures; coverage каждого компонента >80% |
| DEMO-01 | TL/Infra | EXTERNAL | Площадка и учётные данные | Выбрать место demo; при публичном доступе отключить demo-login и добавить защищённый вход/HTTPS |
| DEMO-02 | TL/QA | TODO | QA-02, AI-03, TL-02 | Проверяемые PDF-презентация, видео и репетиция на чистом окружении |

## Контрольные точки

- M0: роли назначены, contracts приняты как общая база, INF-01/02 проверены.
- M1: BE-01/02 + FE-02 + QA-01: вход → список → детали → статус → refresh сохраняет;
  buddy и второй intern не читают чужие задачи. Это первая продуктовая интеграция.
- M2: task chat с источниками + полный цикл run; mock и live результаты различаются в отчёте.
- M3: подтверждённая заявка, реальный вызов corporate mock, persistence и защита от дублей.
- M4: передача согласованной сводки, ответ назначенного buddy, resolved, полный E2E.

Безопасно параллельны сейчас: FE-01, AI-02, BE-01, QA-01 и INF-01.
S2/S1/S3/S4 — порядок интеграции, не запрет готовить независимые части заранее.
Сроки и имена вносятся TL после оценки исполнителями; вымышленных дат нет.
