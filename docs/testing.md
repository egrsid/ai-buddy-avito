# Автоматические тесты

## Зависимости

Docker Engine/Desktop и Compose v2 — для полной проверки; Python 3.12 и uv 0.13.4,
Node.js 26.13.0, Go 1.27.3 и C compiler — для host component tests с Go race detector.
Точные пакеты закреплены в `uv.lock`, `frontend/package-lock.json`, `backend/go.mod`/`go.sum`.

```sh
make install
make check
uv run --frozen python -m scripts.check_components ai
uv run --frozen python -m scripts.check_components frontend
```

`make check` проверяет документацию, контракты, seed, SQL, YAML, ruff и shared tests.
AI unit tests работают с fake storage/provider; пять PostgreSQL/pgvector cases
проверяются отдельно. Fixture-тесты не считаются прохождением бизнес-сценария.

## Backend и corporate mock

Нужна отдельная disposable PostgreSQL-БД с именем `buddy_test_*`, доступная host runner.
Следующий пример — только синтетические тестовые credentials, не учётные данные сервиса:

```sh
export TEST_DATABASE_URL='postgresql://postgres:test_admin@127.0.0.1:5432/buddy_test_ci'
export TEST_APP_PASSWORD='test_app'
export TEST_MOCK_PASSWORD='test_mock'
export MOCK_TEST_DSN='postgresql://mock_service:test_mock@127.0.0.1:5432/buddy_test_ci'
export MOCK_TEST_ADMIN_DSN="$TEST_DATABASE_URL"
uv run --frozen python -m scripts.backend_test_db
uv run --frozen python -m scripts.check_components backend
uv run --frozen python -m scripts.check_components mock
```

Создайте эту БД заранее под административной ролью вашей тестовой PostgreSQL.
Команда подготовки применяет migrations/seed в ней и отклоняет имя вне `buddy_test_*`.
Не используйте БД интерактивного стенда: component tests изменяют synthetic fixtures.
Эта подготовка и PostgreSQL service также заданы в [CI workflow](../.github/workflows/ci.yml).

## Полная проверка в Docker/браузере

На отдельном свежем наборе, с портами по умолчанию из README:

```sh
python3 -m scripts.demo up --project ai-buddy-demo-tests
python3 -m scripts.demo ai-db-test --project ai-buddy-demo-tests
cd frontend
npx playwright install chromium
DEMO_PROJECT=ai-buddy-demo-tests E2E_BASE_URL=http://localhost:15173 npm run test:e2e
cd ..
python3 -m scripts.demo down --project ai-buddy-demo-tests
```

Browser suite включает реальные HTTP-запросы Go/AI/mock, confirm/approval/evidence,
feedback, Telegram preview, AI revision, mobile/keyboard и restart сервисов.
Business API не подменяются route fixtures. Для повторного полного прогона выберите
новое имя project; остановка сохраняет volumes. Проверка когорт запускается отдельно:

```sh
python3 -m scripts.v4_cohorts up
E2E_COHORT_DATASET=1 E2E_BASE_URL=http://localhost:15181 npm run test:e2e --prefix frontend -- v4-cohort-operator
```

Shell-примеры выше используют POSIX sh/bash/zsh; в PowerShell переменные задаются через `$env:NAME`.

## Измерение покрытия

Component runners требуют ≥82% line coverage независимо для каждого компонента.
Для Go профиль statement blocks переводится в консервативный line metric:
общая строка покрыта, только если исполнены все её блоки. Определение —
[scripts/go_coverage.py](../scripts/go_coverage.py). Statement coverage отдельно
не выдаётся за line coverage. Политика и существующие exclusions не менялись.

Результаты создаются в `backend/coverage.coverprofile`, `ai-service/coverage/coverage.xml`,
`mock-services/coverage/coverage.xml`, `frontend/coverage/coverage-summary.json`/`lcov.info`.
Исходные сохранённые отчёты, SHA-256 прикладных файлов и пересчёт метрик:
[coverage](coverage/README.md). Новое измерение — результат запуска runners на вашей машине.

## AI evals и live

Offline evals и safety checks входят в AI tests; дополнительные CLI:

```sh
PYTHONPATH=ai-service uv run --frozen python -m app.revision_draft_evals
PYTHONPATH=ai-service uv run --frozen python -m app.task_clarity_evals
```

Live-проверки требуют собственного ключа/тарифов и создают расходы. После настройки
из README команда `make v4-live-check` проверяет 10 последовательных запросов через Go,
`make v4-live-evals` — редактор ТЗ. Сначала проверяйте `make v4-live-budget`.
Постоянный ledger не удаляется, неизвестный usage сохраняет резерв.
Fake-provider timeout/429/auth/cancel/budget tests не являются реальными авариями провайдера.
