# Development environment

## Версии

| Компонент | Версия / источник |
|---|---|
| Node | 26.13.0, .nvmrc и Dockerfile frontend |
| npm | С выбранным Node; установка только npm ci |
| Go | 1.27.4, go.mod toolchain; stdlib net/http |
| Python | 3.12 (локально 3.12.10), .python-version |
| uv | 0.13.4, Dockerfile/CI; uv sync --frozen |
| PostgreSQL / pgvector | 17 / 0.8.2, Compose image tag |
| JS/TS | exact versions в frontend/package.json + package-lock.json |
| Python пакеты | pyproject.toml, выбранные версии/hashes в uv.lock |

Образы закреплены version tags, не digest. Обновления — отдельным PR с новым lock и
проверками; latest не использовать. Go pgx/v5 и pool заранее закреплены в go.mod/go.sum; соединение с БД добавляет BE-01/02.

Первичные источники: [Go](https://go.dev/dl/), [Node](https://nodejs.org/en/download),
[Vite](https://vite.dev/guide/), [pgvector](https://github.com/pgvector/pgvector),
[FastAPI Docker](https://fastapi.tiangolo.com/deployment/docker/).

## Каталоги

```text
backend/cmd/api/           wiring; будущая логика — backend/internal/
backend/migrations/       app SQL
ai-service/app/           AI wiring; RAG/adapters/tools — отдельные модули
ai-service/migrations/    kb SQL
mock-services/corporate/  corporate mock wiring
mock-services/migrations/ corporate SQL
frontend/src/             UI entrypoint; компоненты/feature-модули добавляет FE
contracts/                JSON schemas/examples
data/seed/                demo dataset
data/knowledge/           учебные документы и eval cases
scripts/                  migrate/seed/check/smoke
tests/                    проверки общих контрактов/утилит
docs/features/            SDD spec/design/tasks
```

## Конфигурация

Compose: .env.example → .env. Admin POSTGRES_* доступны postgres/migrate/seed;
runtime использует PGUSER/PGPASSWORD своей роли. Go: APP_ENV, APP_ORIGIN, AI_BASE_URL,
MOCK_BASE_URL, INTERNAL_API_TOKEN, PG*. AI: INTERNAL_API_TOKEN, PG*, LLM_MODE,
LLM_BASE_URL/MODEL/API_KEY, EMBEDDING_MODEL/DIM. Mock: INTERNAL_API_TOKEN и PG*.
Frontend: API_PROXY_TARGET только для dev proxy; без ключей в browser bundle.
Health wiring пока не читает эти переменные; это контракт будущих обработчиков.

## Миграции и запуск

Новый volume: bootstrap schemas/roles/extension → migrate → seed → AI/mock → Go → frontend.
Миграции выполняет one-shot контейнер под admin ролью; runtime не получает DDL.
Повторный seed не стирает прогресс и не создаёт embeddings. Проверка чистой БД и второго
migrate/seed обязательна в CI. Локальный reset требует явного CONFIRM.

Для host-run DB tooling экспортировать POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD и
PGHOST/PGPORT, затем `uv run --frozen python -m scripts.migrate` и
`uv run --frozen python -m scripts.seed`. В Compose DB порт не опубликован; host-run
требует собственной локальной БД с bootstrap или отдельного dev override.
Не передавать admin DSN runtime сервисам.

## Первый продуктовый checkpoint

M1 после BE-01/02 и FE-02: вход intern-a → задачи → детали → статус → refresh/restart сохраняет;
intern-b и buddy-a не читают задачи intern-a. Bootstrap-экран не выполняет M1.
Полный путь MVP — product specification §4. Успешный YAML parse не заменяет Compose smoke.
