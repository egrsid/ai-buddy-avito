# Development environment

## Версии

| Компонент | Версия / источник |
|---|---|
| Node | 26.13.0, .nvmrc и Dockerfile frontend |
| npm | С выбранным Node; установка только npm ci |
| Go | 1.27.3, go.mod toolchain и Dockerfile backend; stdlib net/http |
| Python | 3.12 (локально 3.12.10), .python-version |
| uv | 0.13.4, Dockerfile/CI; uv sync --frozen |
| PostgreSQL / pgvector | 17 / 0.8.2, Compose image tag |
| JS/TS | exact versions в frontend/package.json + package-lock.json |
| Python пакеты | pyproject.toml, выбранные версии/hashes в uv.lock |

Образы закреплены version tags, не digest. Обновления — отдельным PR с новым lock и
проверками; latest не использовать. Go pgx/v5 и pool заранее закреплены в go.mod/go.sum; соединение с БД добавляют RP-DATA-01/RP-AUTH-01.

Go закреплён на 1.27.3: образ `golang:1.27.4-alpine` отсутствовал в Docker Hub при
проверке 2026-11-10 и останавливал CI до сборки кода. Для всех текущих базовых образов
подтверждены manifest-платформы linux/amd64 (CI) и linux/arm64 (Apple silicon).
Это проверка доступности образов, не результат полного запуска Compose.

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
Postgres-образ собирается через `Dockerfile.postgres`: bootstrap-скрипт копируется внутрь
с правами 755. Bind mount для него не используется, чтобы исполнение не зависело от
прав файловой системы хоста (на macOS наблюдался `bad interpreter: Permission denied`).
Миграции выполняет one-shot контейнер под admin ролью; runtime не получает DDL.
Повторный seed не стирает прогресс и не создаёт embeddings. Проверка чистой БД и второго
migrate/seed обязательна в CI. Локальный reset требует явного CONFIRM.

После ошибки bootstrap кластер PostgreSQL может остаться в volume без ролей и схем:
повторный запуск не выполняет init-скрипты на уже инициализированном кластере.
Только для одноразовой локальной demo-БД допустим `make reset CONFIRM=delete-local-data`
с последующим `make up`: reset удаляет ВСЕ данные проекта. При наличии нужных данных
сначала требуется резервная копия и отдельное восстановление, а не reset.

Для host-run DB tooling экспортировать POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD и
PGHOST/PGPORT, затем `uv run --frozen python -m scripts.migrate` и
`uv run --frozen python -m scripts.seed`. В Compose DB порт не опубликован; host-run
требует собственной локальной БД с bootstrap или отдельного dev override.
Не передавать admin DSN runtime сервисам.



## Target v2 и первый checkpoint

В перепланировании 2026-11-11 runtime/Compose/CI/manifests/locks не менялись.
Существующие migrations/seed/contracts и data/knowledge — legacy v1; команды выше
проверяют именно этот каркас. `kb` остаётся физической схемой логической knowledge.
RP-CONTRACT-01 фиксирует v2 schemas, RP-DATA-01 добавляет SQL, RP-MOCK-01 — dataset v2;
не переписывать применённую 001 и не переназначать старый intern-b команде A молча.
Переход/чистую выделенную demo-БД организует владелец, не автоматический reset.

День 2 нового плана: auth/ACL → доступный JSON journey → состояние доступа из mock IAM;
день 3: draft/confirm/отдельное approval/grant recheck; день 4: DB check/evidence/blockers/buddy;
день 5: второй intern и candidate owner. Полная приёмка: [demo](../product/demo.md),
[testing](../testing/strategy.md). Bootstrap-экран/YAML parse не заменяют checkpoint.

Offline mode target: LLM_MODE=mock без ключа, детерминированные AI и synthetic IAM/DB outcomes;
без LLM/корпоративной сети после подготовки образов/зависимостей. Первая сборка/установка
может требовать сеть. Реальный LLM/embeddings — RP-AI-02, не блокирует offline P0.
Никаких новых .env переменных эта документация не делает работающими автоматически.

RP-INF-01 остаётся открытой после bootstrap Permission denied/COPY исправления; текущая
docs-only задача контейнеры не запускает и volume не удаляет. Проверить clean up,
повтор migrate/seed, verify-db/smoke и затем target full E2E отдельной задачей.
