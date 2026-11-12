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

Текущий каркас: bootstrap schemas/roles/extension → migrate → seed → AI/mock → Go → frontend.
Target v2 добавляет one-shot ingest между seed и AI readiness по требованиям ниже;
в текущем compose.yaml этого шага ещё нет.
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
RP-CONTRACT-01 фиксирует v2 schemas (Backend/AI authors, FE consumer review, TL acceptance).
RP-DATA-01 разделена на BE app/corporate, AI kb/knowledge и TL shared runner; RP-MOCK-01
(Backend) добавляет users/resources/assignments dataset v2;
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

RP-INF-01 назначена TL и остаётся открытой после bootstrap Permission denied/COPY исправления; текущая
docs-only задача контейнеры не запускает и volume не удаляет. Проверить clean up,
повтор migrate/seed, verify-db/smoke и затем target full E2E отдельной задачей.


## Принятые TL требования к AI wiring (ещё не реализованы)

Основание: [AI integration policy](../architecture/ai-integration-policy.md). Технические
изменения выполняются отдельно; это не инструкция запускать отсутствующий service/CLI.

1. **Schemas в образе, RP-INF-01.** После RP-CONTRACT-BE-01/RP-CONTRACT-AI-01 Dockerfile.python
   копирует contracts/ в /workspace/contracts. AI runtime user читает local schemas/$refs
   без сети. Проверка собранного образа валидирует реальный GenerateRequest и отвергает
   неизвестное поле по v2; Pydantic не становится второй независимой schema.
2. **Ingest, RP-INF-01/RP-DATA-TL-01.** AI Engineer поставляет CLI/exit codes; TL добавляет
   one-shot в Compose после успешных migrate+seed, до readiness AI. CLI не вызывает AI HTTP,
   использует ai_service role только в kb и не получает admin DSN. Mock corporate может
   стартовать после seed независимо от ingest, Go ожидает готовность AI/mock.
3. **Offline/live.** По умолчанию ingest mock: chunks/ACL/lexical metadata, без ключей/сети/
   embedding model downloads. Live ingest включается явно только после RP-AI-02 и наличия
   provider/model/dimension/budget; повторный CLI не дублирует chunks, несовместимая версия
   или ошибка → nonzero/AI not ready. Старт не выдаёт пустой live индекс за готовый RAG.
4. **DB integration CI, RP-INF-01.** AI поставляет tests с реальным PostgreSQL/pgvector;
   TL добавляет отдельный test runner/CI override в Compose-сети. Python job сохраняет быстрые
   fake-storage unit tests. Runner ждёт migrate/seed/mock ingest, получает runtime ai_service
   роль без DDL/доступа app/corporate, использует fake LLM/fixture embeddings без платного key.
   Test image содержит dev pytest deps отдельно от production --no-dev. Логи и exit code
   runner обязательны; make smoke/verify-db не заменяют эти tests.
5. **Fault configuration, RP-INF-01.** APP_ENV и MOCK_FAULTS_ENABLED передаются AI явно
   только в local/test harness; default false. X-Mock-Scenario нельзя включить из public
   browser request. Server-side AI_MOCK_SCENARIO в Go test environment валидируется при
   старте; в production/live faults запрещены. Новые переменные ещё не добавлены в .env/Compose.
6. **UTF-8, RP-DATA-TL-01.** Seed/migrate/check текстовые reads/writes задают encoding="utf-8",
   включая scripts/seed.py. Добавить non-ASCII fixture roundtrip/hash test без зависимости
   от locale; текущие неявные read_text ещё не исправлены этой документацией.
7. **Общие инструкции/config/deps.** AI предоставляет проверенные команды ingest, env names,
   provider adapter dependency/lock diff и test commands. TL меняет README/.env.example,
   pyproject.toml/uv.lock и CI wiring после этих входов. Значения ключей/бюджета не придумывать.

Приёмка отдельно показывает: runtime schema доступна в image, ingest повторяем, default
mock startup без provider calls, DB integration tests реально используют PostgreSQL и
не читают чужие схемы, UTF-8 проверен. Успешный YAML parse/legacy make check этого не доказывает.

## TL implementation · 2026-11-12

Актуальный статус перекрывает исторические «еще не реализовано» выше:
contracts COPY, отдельный test image, target Compose overlay/CI gate и explicit UTF-8
уже подготовлены. [TL evidence](../team/tl-readiness.md). Base compose остается bootstrap;
сам AI ingest и бизнес-readiness еще должен поставить AI Engineer.

Bootstrap проверен отдельно от пользовательских данных: проект ai-buddy-tl-20261111,
BACKEND_PORT=18080, FRONTEND_PORT=15173, APP_ORIGIN=http://localhost:15173. После проверки
проект останавливается без удаления его pgdata volume; старые volumes не затрагиваются.

После принятой поставки BE/AI/FE в единой integration папке:

1. AI передает JSON argv команды ingest и DB tests; экспортировать их как
   AI_INGEST_COMMAND/AI_DB_TEST_COMMAND перед make mvp-up (preflight не читает .env).
   Команды выбирает AI; отсутствие CLI/test suite не заменять exit 0/пустым pytest.
2. make check, make test; tests каждого компонента должны дать >80% lines.
3. make mvp-up: compose.yaml + compose.mvp.yaml. Указать отдельный COMPOSE_PROJECT_NAME
   и свободные BACKEND_PORT/FRONTEND_PORT/APP_ORIGIN при запуске рядом с другой БД.
4. make ai-db-test: настоящий PostgreSQL/pgvector и ai_service без admin DSN, mock LLM.
   Test image содержит dev deps и writable coverage dirs; production остается --no-dev.
5. Повтор ingest/seed/migrate без потери прогресса, verify-db, browser A/B/C, security,
   реальный restart и offline rehearsal. Хранить реальные outputs и версии dataset/template.

MVP overlay намеренно использует /readyz: AI проверяет schema/index/migrations. Текущий
/healthz-only bootstrap его не пройдет. Нельзя менять readiness обратно на liveness ради
зеленого запуска. APP_ENV/LLM_MODE/fault flag/scenario передаются явно; runtime validation
HTTP headers/таймеров/конфигурации остается задачей BE/AI, wrapper проверяет task runners.

Workflow dispatch mvp_acceptance=true запускает opt-in AI DB portion после component
поставок. Repository vars AI_INGEST_COMMAND/AI_DB_TEST_COMMAND — argv, не secrets;
компонентные integration и полный browser E2E остаются обязательными отдельно.

V2 app/corporate seed поставлен как отдельный `SEED_DATASET=v2`; default остаётся legacy.
Target overlay выбирает v2 явно. Существующего intern-b из legacy team-b seed не
переназначает: при конфликте требуется отдельная свежая v2 DB/Compose project.
KB наполняет AI Engineer через свой ingest. Применённые 001/002 не переписаны;
новые app 003/004 и corporate 003 проходят checksum-protected migrate.
`make verify-db` пока проверяет legacy dataset и не является v2 acceptance.

## Backend component и API acceptance

Нужна отдельная disposable PostgreSQL, admin DSN только у test setup; runtime использует
app_service/mock_service. Не использовать приложение/существующий demo volume как test DB.
CI jobs backend/python поднимают отдельный postgres:17 и автоматически готовят schemas/seed.
Локальный setup принимает только DB с именем buddy_test_*:

```sh
export TEST_DATABASE_URL=postgresql://postgres:test_admin@127.0.0.1:5432/buddy_test_local
export TEST_APP_PASSWORD=test_app TEST_MOCK_PASSWORD=test_mock
export MOCK_TEST_DSN=postgresql://mock_service:test_mock@127.0.0.1:5432/buddy_test_local
export MOCK_TEST_ADMIN_DSN="$TEST_DATABASE_URL"
uv run --frozen python -m scripts.backend_test_db
uv run --frozen python -m scripts.check_components backend
uv run --frozen python -m scripts.check_components mock
```

Go требует закреплённый toolchain и C compiler для -race. Runtime tests очищают только
выделенную test DB; Go HTTP client contract harness не выдаётся за настоящий AI provider.
В отдельном свежем v2 окружении с Go + corporate выполнить:

```sh
BACKEND_ACCEPTANCE_URL=http://127.0.0.1:18080 APP_ORIGIN=http://localhost:5173 \
  uv run --frozen python -m scripts.backend_acceptance
```

Это настоящий Go → corporate → PostgreSQL API-путь: две заявки/одобрения/IAM/SSL,
buddy/recheck, distinct friction и human review. При недоступном AI используются явные
безопасные fallback; browser/RAG/live LLM приёмку эта команда не подтверждает.
Повторный полный acceptance требует свежих тестовых данных; существующие результаты
проверяются чтением после restart. LLM key/env/расходы и полное подключение — AI Engineer,
без ожидания подтверждения TL. [Фактический прогон](../team/tl-readiness.md).
