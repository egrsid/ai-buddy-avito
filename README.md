# Avito AI-buddy

Учебный AI-помощник для адаптации стажёров: контекстные объяснения, план задач,
заявка на доступ через mock-сервис и передача вопроса живому наставнику.
MVP включает стажёра и buddy. HR и реальные корпоративные доступы вне scope.

## Состояние проекта

Подготовлены архитектура, API/DTO, права, SQL-миграции, синтетические данные,
SDD четырёх сценариев, backlog, зависимости, каркас сервисов, Compose и CI.
**Продуктовые сценарии S1–S4 ещё не реализованы.** Сейчас доступны только стартовый
экран frontend и liveness endpoints; demo-login, задачи, чат и tools — задания команды.
LLM по умолчанию mock; live-провайдер, ключ и embeddings ещё требуют AI-01.

## Старт команды

1. TL назначает участников и reviewer в [working agreements](docs/team/working-agreements.md).
2. Разработчики берут READY-задачи из [backlog](docs/team/backlog.md).
3. Общая база — [архитектура](ARCHITECTURE.md), [решения](docs/architecture/decisions.md),
   [API](docs/architecture/api-contracts.md) и [права](docs/architecture/security.md).
4. Первый checkpoint: вход → свои задачи → детали → смена статуса → сохранение после refresh.
5. Изменения передаются через обычный PR: локальные файлы сами по себе не означают
   публикацию в remote или включение protection main.

## Запуск каркаса через Docker

Нужны Docker Engine/Desktop с Compose v2 (2.20+), Git и make. Go/Node/Python для
контейнерного запуска на хосте не нужны. Для `make smoke` нужен Python 3.

```sh
cp .env.example .env
make up
make smoke
make verify-db
```

Откройте http://localhost:5173. Go liveness: http://localhost:8080/healthz.
AI/mock/PostgreSQL доступны только внутри Compose-сети; публикация портов — на 127.0.0.1.
Первый старт: bootstrap ролей/pgvector → миграции → seed → сервисы.
Первичная сборка загружает образы и зависимости из сети.

`.env.example` содержит локальные demo-значения, `.env` исключён из Git.
LLM_MODE=mock не требует ключа. Реальный LLM пока не подключён.
Healthcheck проверяет процесс, не готовность бизнес-функций.
На машине подготовки Docker отсутствовал: контейнерный запуск должен подтвердить INF-01/CI.

```sh
make migrate     # новые миграции; повторный запуск безопасен
make seed        # без перезаписи существующего прогресса
make down        # остановить, сохранить данные
make reset CONFIRM=delete-local-data  # удалить ВСЕ локальные данные
```

Bootstrap ролей выполняется только при создании volume. Изменение DB-паролей в .env
не меняет уже созданные роли: отдельное ALTER ROLE или осознанный local reset.

## Локальная разработка

Node 26.13.0 (`.nvmrc`), Go 1.27.4 (`backend/go.mod`), Python 3.12, uv 0.13.4 и npm.
Frontend: точные версии в `package.json`, транзитивные — `package-lock.json`.
Python: `pyproject.toml` + `uv.lock`. PostgreSQL 17 + pgvector 0.8.2.
Подробности и каталоги: [development](docs/operations/development.md).

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

Пока каркас не использует БД; будущим handlers нужны PGHOST/PGDATABASE/PGUSER/PGPASSWORD.
Vite проксирует /api в localhost:8080. При host-run .env автоматически не загружается:
передавайте переменные через shell/IDE; Compose подставляет их автоматически.

## Проверки

- `make check`: ссылки, JSON Schema/примеры, seed, синтаксис SQL, YAML, Python lint/format и тесты
  контрактов/безопасности миграций.
- `make test`: также Go vet/build и frontend typecheck/build; с появлением бизнес-модулей
  component tests и обязательный line coverage **строго >80%** каждого компонента.
- `make smoke`: liveness работающего Compose.
- `make verify-db`: seed и разграничение runtime DB-ролей.

Сейчас runtime состоит из wiring, runner явно печатает BOOTSTRAP и не выдаёт отсутствие
бизнес-кода за 100% покрытия. Логика размещается в Go internal/, Python вне main.py,
frontend-компонентах вне main.tsx; с первой такой фичи порог обязателен.
Health wiring не расширять бизнес-логикой.
Playwright настроен, E2E предстоит добавить; после этого в frontend установить browser
`npx playwright install chromium` и запустить `npm run test:e2e`.
[Матрица тестов](docs/testing/strategy.md), [CI](.github/workflows/ci.yml).

## Синтетические аккаунты

| account_id | Роль | Назначение |
|---|---|---|
| intern-a | Стажёр | buddy-a |
| intern-b | Стажёр | buddy-b |
| buddy-a | Наставник | Только intern-a |
| buddy-b | Наставник | Только intern-b |

Паролей нет; demo-login по account_id появится в BE-01, только local/test.
Seed содержит 4 аккаунта, 8 задач и 3 документа, без эмбеддингов. Две пары нужны
для отрицательных проверок доступа. Материалы учебные, не регламенты Авито.

## Документы и внешние условия

- [Продукт](docs/product/specification.md), [UI](docs/design/UI_GUIDELINES.md),
  [референс](docs/design/ui-reference.png), [SDD](docs/features/).
- [Модель данных](docs/architecture/data-model.md), [состояния](docs/architecture/state-machines.md),
  [AI design](docs/architecture/ai-design.md), [DTO](contracts/v1.schema.json).
- [Внешние зависимости](docs/operations/external-dependencies.md): имена/доступы команды,
  LLM и бюджет, исходные требования организаторов, площадка demo.

Презентация кейса и интервью пока не приложены; TL сверяет требования до финальной сдачи.
Публичное размещение demo-входа требует отдельного решения по auth/HTTPS.
