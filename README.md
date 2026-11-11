# Avito AI-buddy

**Engineering Onboarding & Feedback Loop** — помощник инженерного стажёра от рабочей
цели до проверенного результата. Утверждённый маршрут учитывает права и зависимости,
помогает оформить заявку, проверяет подключение, передаёт диагностику buddy и обнаруживает
повторяющиеся проблемы, чтобы человек мог улучшить инструкцию.

Главный MVP: **доступ к синтетической тестовой БД → отдельное mock-одобрение → IAM recheck →
безопасный connection check → blocker/buddy → та же ошибка у второго стажёра → Knowledge Gap Candidate**.
Чат/RAG помогают цели; ручной checklist и расшифровка терминов не центр продукта.

## Состояние и перепланирование

На 2026-11-11 обновлена документация по [CODEX_PROJECT_REPLAN.md](CODEX_PROJECT_REPLAN.md).
**Новый MVP ещё не реализован.** Сейчас доступны только bootstrap frontend и liveness;
login, journeys, AI, access/approvals/checks, buddy и feedback loop — задачи разработки.
JSON contracts, SQL migrations, seed, runtime knowledge, Compose/CI и код в рамках этого
перепланирования не менялись; они содержат legacy v1 (task статусы, 4 аккаунта, repo demo).
Нельзя считать прохождение legacy checks доказательством готовности нового продукта.

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
   Вся RP-CONTRACT-01 ещё не DONE; после неё — RP-DATA-01. Текущая [v1 schema](contracts/README.md)
   не описывает новые Goal/Step.
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
ключа; mock provider и live adapter пока не реализованы. Healthcheck — только liveness.
Предыдущая INF-01 не закрыта: после исправления bootstrap COPY в Dockerfile.postgres
чистый up/migrate/seed/verify-db/smoke ещё требует подтверждения RP-INF-01. В этом задании
контейнеры не запускались, существующий volume не удалялся.

```sh
make migrate
make seed
make down
```

Миграции повторяемы, seed не должен стирать существующий прогресс.
`make reset CONFIRM=delete-local-data` удаляет ВСЕ local данные; выполнять только по явному решению
владельца. Bootstrap выполняется только на новом volume; изменение .env не меняет
существующие DB-роли/пароли. Восстановление после bootstrap error: [development](docs/operations/development.md).

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
