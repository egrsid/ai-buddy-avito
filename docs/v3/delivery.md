# V3 — backlog, зависимости и передача команде

Дата: 13 ноября. Пакет документации подготовлен; runtime задачи **TODO**, реализация следует согласованным contract dependencies. Сроки/имена людей не придуманы. Текущая docs ветка
не является готовым runtime release и не заменяет main для демо.

## Очередь и Definition of Done

| ID | Owner / reviewer | Зависимости | Каталоги при реализации | Результат / gate |
|---|---|---|---|---|
| V3-TL-01 | TL / владелец продукта | main audit | docs/, AGENTS.md | DONE docs: Product/Telegram/task editor/reports/SDD/ADR/план; consumer approval ещё открыт |
| V3-CONTRACT-BE-01 | BE / TL, FE, AI | TL-01 | contracts/v3 proposed public/common/events, backend contract tests | Исполняемые schemas/fixtures: contact preview/export, brief/version/assignment/friction/report/review/errors/retirement |
| V3-CONTRACT-AI-01 | AI / BE, TL | TL-01, согласованные common refs | contracts/v3 internal AI, AI contract tests | Safe aggregate/input/output bounds, no identity/raw chat, deterministic fallback |
| V3-CONTRACT-FE-01 | FE / BE, TL | BE/AI proposals | frontend/src/contracts/ | Typed parsing всех positive/negative DTO, null/empty/error/version cases; конкретный consumer review |
| V3-CONTRACT-01 | TL / BE+AI+FE | три contract задачи | docs/team/contract-handoff.md | Принятый общий lock/baseline и migration/retirement plan; до него runtime DTO не фиксируются |
| V3-DATA-01 | BE / TL, AI | CONTRACT-01 | backend/migrations/, data/seed/, mock-services/ при необходимости | Только новые миграции app; synthetic Telegram/brief/assignments; существующие данные сохранены |
| V3-CONTACT-01 | BE / FE, TL | CONTRACT-01, DATA-01 | backend/ | Scoped Telegram URL, TTL preview/export, revoke checks, запрет новой internal escalation |
| V3-TASK-01 | BE / FE, TL | CONTRACT-01, DATA-01 | backend/ | Draft/publish/archive/assignment/adopt, immutable versions, editor permissions, no AI verified |
| V3-FRICTION-01 | BE / QA, AI, TL | TASK-01 | backend/ | Структурированные признаки неясности, deterministic distinct/window/dedup/ACL/report reserve; docs flow независим |
| V3-AI-01 | AI / BE, TL | CONTRACT-01 | ai-service/, evals/, data/knowledge/ только свои fixtures | Объяснение/Telegram-safe summary/task report hypothesis; offline; no app writes/auto-send/виновник; >=20 evals, all safety pass |
| V3-REVIEW-01 | BE / FE, AI | FRICTION-01, AI-01 | backend/ | Report review и resolved successor version, AI retry обновляет один объект |
| V3-FE-01 | FE / BE, TL | CONTRACT-01; runtime по частям | frontend/ кроме QA-owned tests | Telegram/copy/empty/errors; удалить inbox/reply UX; кабинет наставника/редактор/версии/report; сохранить выбранный дизайн |
| V3-MIGRATE-01 | BE / TL, QA | CONTACT-01, TASK-01, REVIEW-01 | backend/migrations/, backend/ | Старые pending/unknown/history, no dual-write, backfill task refs не выдумывает контекст |
| V3-QA-01 | QA / BE, FE, TL | План сейчас; прогон после runtime | docs/testing/, frontend/e2e/v3-api-*.spec.ts | Негативная матрица, разные версии/owners/teams, replay/concurrent/ACL; новые QA файлы не затирают legacy smoke |
| V3-E2E-01 | FE / QA, TL | FE-01, MIGRATE-01, component reports | frontend/e2e/v3-browser-*.spec.ts | Полный пользовательский путь v3 + регрессия DB/docs; screenshot/keyboard/mobile/reload |
| V3-INTEGRATION-01 | TL / все consumers | все delivery задачи | scripts/, Compose/CI/docs | Clean isolated dataset, ingest/readiness, настоящий restart, >80% каждый компонент, v2 regressions; main release только после evidence |

CONTRACT-BE и CONTRACT-AI согласуют общие refs параллельно; FE review не ждёт готового
runtime. DATA/CONTACT/TASK после gate, AI можно тестировать на принятых fixtures; FE
готовит layout по явно помеченным fixtures, подключает только готовые Go endpoints.
QA пишет план сейчас, тесты в следующем implementation task; не отвечает за coverage чужих компонентов.

## База и ветки

Сначала владелец публикует docs/v3-planning и принятую planning базу. Предлагаемые ветки
(пока **не созданы**): feature/backend-v3, feature/ai-v3, feature/frontend-v3,
feature/qa-v3, feature/tl-v3. Создавать от общей main b6f940d + принятой docs поставки,
а не от расходящихся старых v2 branches. Не force-reset старых веток и не терять локальную
работу участников. Распространение/remote merge — владелец; агент не push/PR.

## Handoff по ролям

TL: проверить gate, владельцев и semantic constraints, назначить acceptance, сохранить main demo.
BE: source-of-truth модели/ACL/миграции, редактор/версии/назначения, Telegram-contact,
порог/отчёты/review/retirement. Предъявить реальные DTO и consumer examples до runtime.
AI: работать только с переданным разрешённым минимумом; Telegram username исключён;
разделять факты/предположение/предложение, использовать выбранный fallback и бюджет.
FE: выбранный стиль main, goal/step context, явные labels copy/open/publish, no delivered badge;
наставник получает редактор и агрегаты вместо inbox. Backend остаётся единственным API.
QA: V3-T01…T14 из [матрицы](testing.md), изолированный dataset, подтверждения реальных
операций, отсутствие личных сообщений наружу. Компонентные tests принадлежат авторам.

## Gate перед выпуском

Нельзя считать v3 DONE по одним schemas, fixture UI или green make check. Нужны все
V3-T01…T14, >=20 AI evals/all safety, coverage >80% per component, persistence/ACL/
version/replay/concurrency/retirement, клики в браузере и отдельный Go↔AI review.
Открытые настройки до contract gate: final DTO names, стабильные permission codes,
retention для реальных данных. Telegram уже выбран владельцем; это не открытый вопрос.
