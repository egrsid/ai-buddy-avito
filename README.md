# Avito AI-buddy

**Engineering Onboarding & Feedback Loop** — помощник инженерного стажёра от рабочей
цели до проверенного результата. Утверждённый маршрут учитывает права и зависимости,
помогает оформить заявку, проверяет подключение, передаёт диагностику buddy и обнаруживает
повторяющиеся проблемы, чтобы человек мог улучшить инструкцию.

Главный MVP: **доступ к синтетической тестовой БД → отдельное mock-одобрение → IAM recheck →
безопасный connection check → blocker/buddy → та же ошибка у второго стажёра → Knowledge Gap Candidate**.
Чат/RAG помогают цели; ручной checklist и расшифровка терминов не центр продукта.

## Состояние и перепланирование

Документация и P0-план обновлены по [CODEX_PROJECT_REPLAN.md](CODEX_PROJECT_REPLAN.md).
**Новый MVP еще не готов.** В TL checkout сведены executable v2 schemas BE+AI, подготовлены
общие tooling/Docker/Compose/CI; runtime и dataset пока bootstrap/legacy. В отдельной
FE-ветке есть fixture UI. Consumer gate и продуктовая реализация еще открыты.
Фактические commits, TL решения/проверки и остаток: [TL readiness](docs/team/tl-readiness.md).
Новая AI-поставка 3f955322 содержит offline API/SSE/ACL/diagnostics и семь документов:
184 tests, 99.90% coverage, evals 29/29. Она пока не импортирована в этот checkout;
[повторный review](docs/team/ai-review-2026-11-12.md) содержит четыре открытых замечания,
включая отсутствие persistent kb/ingest/readiness. Это не готовность полного MVP.
Срок владельца — **12 ноября 2026, 22:00 МСК**; он не заменяет приемку P0.

Стек сохранён: React/TypeScript/Tailwind/TanStack Query/Zod → Go REST/SSE → Python/FastAPI
и corporate mock; одна PostgreSQL с app/kb/corporate, pgvector для knowledge. Только Go
меняет бизнес-состояние; Python предлагает действия и фильтрует знания до LLM. Test DB
сценария не является внутренней PostgreSQL. [Architecture](ARCHITECTURE.md).

## Старт команды

1. Прочитать [AGENTS](AGENTS.md), [vision](docs/product/vision.md), [Product Spec](docs/product/specification.md),
   [ADR](docs/architecture/decisions.md), [API/events](docs/architecture/api-contracts.md).
2. Пять ролей уже получили [индивидуальные назначения](docs/team/assignments/README.md).
   Fullstack–QA–Integration имеет один небольшой RP-QA-01; фактические и планируемые
   рабочие ветки перечислены в [inventory](docs/team/branches.md). Владелец публикует
   текущую редакцию и готовит рабочие папки, не теряя существующую QA-работу.
3. TL-часть RP-CONTRACT-01 подготовлена: [решения](docs/architecture/contract-baseline.md).
   Backend делает RP-CONTRACT-BE-01, AI Engineer — RP-CONTRACT-AI-01, Frontend проверяет
   потребление DTO, TL затем принимает комплект. [Contract handoff](docs/team/contract-handoff.md).
   Вся RP-CONTRACT-01 ещё не DONE; после неё — RP-DATA-01. [Статус schemas](contracts/README.md) отделяет проверенный snapshot от final acceptance.
4. Команда берёт задачи [backlog](docs/team/backlog.md): семь дней от спецификаций до demo.
   Первый продуктовый checkpoint — разрешённый JSON journey и фактический IAM access state.
5. Агенты работают локально только в назначенной текущей ветке, без создания/переключения
   веток. Публикацию, PR и права выполняет владелец репозитория.

## Запуск существующего каркаса через Docker

Нужны Docker Engine/Desktop с Compose v2 (2.20+), Git и make; для smoke — Python 3.
Node/Go/Python для контейнерного запуска на хосте не нужны. Команды ниже запускают
**текущий каркас**, не новый продуктовый демосценарий.

```sh
cp .env.example .env
make up
make smoke
make verify-db
```

http://localhost:5173, Go http://localhost:8080/healthz. AI/mock/PostgreSQL доступны только
в Compose-сети; порты хоста привязаны к 127.0.0.1. Первый старт: bootstrap roles/pgvector →
migrate → seed → сервисы; сборка загружает образы/зависимости из сети. После подготовки
образов offline demo не должен требовать LLM/корпоративной сети; это отдельная приёмка.

.env.example содержит только local demo values, .env в Git ignore. LLM_MODE=mock не требует
ключа; live LLM подключается по разделу [LLM и ключ](#llm-и-ключ). Healthcheck — только liveness.
Предыдущая INF-01 не закрыта: после исправления bootstrap COPY в Dockerfile.postgres
bootstrap up/migrate/seed/verify-db/smoke подтверждены TL, target v2 требует отдельной RP-INF-01 приемки. TL теперь подтвердил bootstrap в отдельном проекте, повтор migrate/seed, role isolation и
liveness; target P0 еще не проверен. Существующие volumes не удалялись.

```sh
make migrate
make seed
make down
```

Миграции повторяемы, seed не должен стирать существующий прогресс.
`make reset CONFIRM=delete-local-data` удаляет ВСЕ local данные; выполнять только по явному решению
владельца. Bootstrap выполняется только на новом volume; изменение .env не меняет
существующие DB-роли/пароли. Восстановление после bootstrap error: [development](docs/operations/development.md).

## LLM и ключ

По умолчанию `LLM_MODE=mock`: детерминированные ответы без сети и ключа, на нём работают
тесты, CI и offline demo. Live-режим (`LLM_MODE=live`) подключает модель через один из адаптеров:

| | Платный API (основной для demo) | Локально (разработка) |
|---|---|---|
| Сервис | Cloud.ru Evolution Foundation Models | Ollama на хосте |
| `LLM_PROVIDER` | `openai` (OpenAI-совместимый `/v1`) | `ollama` (нативный `/api/chat`) |
| `LLM_BASE_URL` | `https://foundation-models.api.cloud.ru/v1` (сверить в консоли) | `http://host.docker.internal:11434` |
| `LLM_MODEL` | `ai-sage/GigaChat3.5-432B-A28B` | `qwen3.5:9b` |
| `EMBEDDING_MODEL` | `BAAI/bge-m3` | `bge-m3` |
| Ключ | `LLM_API_KEY` | не нужен |

Подключить свой ключ: в `.env` задать `LLM_MODE=live`, `LLM_PROVIDER=openai`, адрес, модели и
`LLM_API_KEY`, затем `make up`. Подойдёт любой OpenAI-совместимый провайдер: тогда замените
адрес, модели и тарифы. Ключ хранится только в `.env` (он в Git ignore) и не пишется в логи.
После смены эмбеддинг-провайдера или модели индекс знаний пересобирается через ingest, иначе
сервис не готов. Смена только модели чата или ключа пересборки не требует.

Расходы платного API ограничены: перед каждым вызовом верхняя оценка цены резервируется в
журнале `/var/lib/ai-budget/budget.sqlite` (Docker-том `ai-budget`), после ответа
записывается фактическая цена по usage. На `LLM_BUDGET_STOP_RUB` (по умолчанию 800 ₽) вызовы
прекращаются, и ответ приходит с `LLM_UNAVAILABLE`. Тарифы (`LLM_PRICE_*`) обязательны.
Посмотреть расход:
`docker compose exec -w /workspace/ai-service ai-service python -m app.budget status`.

## Локальная разработка

Закреплены Node 26.13.0 (.nvmrc), Go 1.27.3 (backend/go.mod), Python 3.12, uv 0.13.4,
PostgreSQL 17/pgvector 0.8.2. Прямые frontend версии в package.json, lock в package-lock.json;
Python pyproject.toml + uv.lock. Подробности: [development](docs/operations/development.md).

```sh
make install
make check
make test
```

В отдельных терминалах из корня:

```sh
cd backend
go run ./cmd/api
```

```sh
uv run --frozen uvicorn app.main:app --app-dir ai-service --port 8000
```

```sh
uv run --frozen uvicorn corporate.main:app --app-dir mock-services --port 8001
```

```sh
cd frontend
npm run dev
```

Каркас не использует БД; будущим handlers нужны PGHOST/PGDATABASE/PGUSER/PGPASSWORD.
Vite proxy /api → localhost:8080. Host-run не загружает .env автоматически: shell/IDE
передают переменные; Compose подставляет их. Не передавать admin DSN runtime.

## Проверки

- make check: локальные ссылки, legacy JSON Schema/examples/seed, SQL syntax/YAML,
  Python lint/format и tests контрактов/миграций.
- make test: дополнительно component checks Go/AI/mock/frontend, vet/build/typecheck;
  line coverage строго >80% каждого прикладного компонента с первой бизнес-фичи.
- make smoke: только liveness работающего Compose; make verify-db: seed/DB role isolation.
- В текущей foundation P0 E2E отсутствуют; в отдельной QA-ветке есть два legacy API-теста
  ([inventory](docs/team/branches.md)), назначенных Fullstack на адаптацию. Полный browser
  E2E — задача Frontend RP-E2E-01. После добавления тестов: из frontend
  `npx playwright install chromium`, затем `npm run test:e2e`.

До бизнес-модулей runner пишет BOOTSTRAP, не 100% покрытого MVP. Нельзя помещать логику
в исключённый wiring. [Testing](docs/testing/strategy.md) содержит новую матрицу приёмки;
[CI](.github/workflows/ci.yml) пока проверяет существующий каркас.

## Тестовые пользователи: сейчас и целевой seed

**Текущий seed v1:** intern-a команды A → buddy-a; intern-b команды B → buddy-b.
Всего 4 аккаунта, 8 задач, 3 demo_public документа, без embeddings. Login пока отсутствует.

**Планируемый seed v2 (RP-MOCK-01, ещё не создан):** intern-a и intern-b команды A → buddy-a;
intern-c команды B → buddy-b; approver-a и docs-owner-a с ограниченными назначениями.
Ресурсы db-team-a-test, db-team-b-test, db-restricted; team/restricted/private synthetic
документы. Разделение двух одинаковых ошибок внутри команды A и чужой команды B необходимо
для feedback loop и negative ACL. Изменение команды старого intern-b не выполняется тихо
при повторном seed; переход описан в [data model](docs/architecture/data-model.md).
Материалы учебные, не реальные регламенты/данные Авито.

## Demo и границы

[Пятиминутный сценарий](docs/product/demo.md): цель → AI draft/confirm → отдельный approver →
SSL failure → buddy/recheck → второй intern → candidate для docs-owner. Это target demo,
недоступное в текущем каркасе. Mock approval и evidence явно обозначаются как synthetic.
No confirm ≠ submitted, approved ≠ grant, ответ buddy ≠ verified; Go проверяет результат.
Accepted candidate не редактирует/не публикует документацию.

HR, реальные интеграции, arbitrary SQL/команды, MR/code review/IDE, workflow builder,
ML-кластеризация и multi-agent платформа вне MVP. Все P0 — [восемь SDD](docs/features/README.md).
Внешние provider/key/budget, originals и площадка — [dependencies](docs/operations/external-dependencies.md).
Live LLM не блокирует offline P0; публичный demo требует отдельной auth/HTTPS и отключения demo-login.

## Target acceptance после поставки компонентов

`make mvp-preflight` выявляет отсутствие runtime/migrations/tests. `make mvp-up` использует
compose.mvp.yaml: seed → AI ingest → /readyz → Go → UI. `make ai-db-test` запускает
реальные AI DB tests в отдельном test image под runtime ролью. Сейчас preflight BLOCKED.
AI Engineer передает **реальные JSON argv arrays**, которые экспортируются в окружение
как AI_INGEST_COMMAND и AI_DB_TEST_COMMAND перед make mvp-up. Никакого shell eval нет;
самих CLI/tests в bootstrap пока нет. APP_ENV=local/test, LLM_MODE=mock, faults default false.
CI workflow_dispatch mvp_acceptance включает тот же gate после поставок, команды берет
из repository vars; текущая правка не меняет настройки GitHub. Это только AI DB portion,
не замена browser/security/full offline acceptance. [Инструкции](docs/operations/development.md).
