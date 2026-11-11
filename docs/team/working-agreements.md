# Работа команды — перепланирование v2

2026-11-11 · пять участников разработки. Имена/handles в репозитории отсутствуют;
TL назначает реальных людей, не заменяя их вымышленными именами. Прикладные роли
intern/buddy/approver/documentation_owner — synthetic пользователи, не состав команды.

| Участник / роль | Имя / handle | Ответственность и директории | Review |
|---|---|---|---|
| 1. Tech Lead | Назначает владелец | Scope, архитектура, API/events, access policy, checkpoints, docs/ и contracts/ | Consumer owners для API/данных |
| 2. Backend / Go | Назначает TL | backend/, app migrations; journey, evidence, actions, blockers/friction/candidates, бизнес-валидация | TL + FE/AI потребитель |
| 3. AI Engineer / Python | Назначает TL | ai-service/, kb migrations, data/knowledge/; provider/fallback, secure RAG, schemas/prompts, drafts/summaries/evals | Backend для interface, TL для security |
| 4. Frontend | Назначает TL | frontend/; goal/step, evidence, confirm, errors, buddy/approval/candidate UI | Backend для DTO, QA для UX |
| 5. Fullstack / QA / Integration | Назначает TL | mock-services/, corporate migrations, data/seed/, scripts/, Compose/CI, E2E/demo | Backend + AI для data/ACL, TL для infra |

QA/Infra не добавлены как шестой и седьмой человек: это обязанности пятого участника
с помощью владельцев компонентов. Конкретное распределение адаптирует TL явно.
TL не проектирует за AI Engineer внутренние adapters/prompting/retrieval. Изменение
shared contracts/владения требует TL и consumer review до кода, а не разрешения LLM.

## Источники и переход

Основание смены scope: [brief](../../CODEX_PROJECT_REPLAN.md). Рабочая единая модель:
[Product Spec](../product/specification.md), [Architecture](../../ARCHITECTURE.md),
[ADR](../architecture/decisions.md), target [API](../architecture/api-contracts.md)/
[events](../architecture/event-contracts.md), [SDD](../features/README.md), [backlog](backlog.md).
При расхождении исправить затронутые стороны до реализации, не выбирать удобный документ.
[Audit](replan-audit.md) фиксирует допущения, открытые TL-решения и legacy gap.

Executable v1 contracts/DDL/seed остаются legacy, не источником нового scope.
RP-CONTRACT-01 согласует v2 schema/examples/потребителей, RP-DATA-01 добавляет миграции;
fixtures разрешены только по согласованному новому DTO и явно помечаются как fixtures.
Изменённые permissions/chunks/sources проверяются с обеих сторон до LLM.

## Постановка, локальная работа и приёмка

Задача: ID, P0/P1/P2, роль/назначенный человек, зависимости, директории, наблюдаемый
результат/DoD, SDD и команды проверки. Ownership не означает готовность. DONE только
после реального результата; healthchecks/fixtures не продуктовая интеграция.
В текущем поручении RP-DOC-01 разрешены только Markdown-документы, текущая ветка
feature/team-start-foundation; код/JSON/SQL/seed/конфигурация не меняются.

Агенты не создают, не переключают и не посещают другие ветки, не публикуют/не открывают
PR. Владелец назначает рабочую ветку/папку; публикация, PR/review/merge и Git hosting
настройки принадлежат владельцу/уполномоченному maintainer. Не добавлять Codex co-author.
Сохранять чужие изменения. Не коммитить .env/ключи/зависимости/build artifacts/реальные данные.

Проверки [testing](../testing/strategy.md): make check, component checks, >80% line coverage
каждого компонента с первой бизнес-фичи; нельзя расширять health wiring бизнес-логикой
или исключать её ради порога. Новые SQL-файлы вместо изменения применённых миграций.
UI следует reference/tokens; screenshots/responsiveness после реальной FE-реализации.

## Синхронизация

В начале дня: результат/следующая задача/блокер в трекере, канал/время определяет TL.
Перед checkpoint — E2E через реальные компоненты на чистой synthetic БД и negative ACL.
Изменение контракта синхронно отражается в docs/schema/examples/consumer tests. Никаких
скрытых SQL-правок для демо. Внешний provider не блокирует offline P0.

Недельные checkpoints в backlog, пятиминутное demo — [demo](../product/demo.md).
Оригиналы кейса/созвонов/исследования не приложены; TL сверяет требования и лицензии,
доступы/ключи/пройденные проверки не выдумываются. Документация не меняет hosting permissions.
