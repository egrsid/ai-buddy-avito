# Avito AI-buddy

**План следующего релиза: [v3](docs/v3/README.md).** Подготовлен только пакет документации
в docs/v3-planning: Telegram вместо внутренних обращений, версии ТЗ и отчёты наставнику.
Опубликованный main b6f940d и работающий Docker остаются v2. Состояние всех remote branches
и успешного main CI подтверждено: [аудит](docs/team/repository-audit-2026-11-13.md).
При реализации v3 читать новый пакет; нижние инструкции запуска относятся к main/v2.

**Engineering Onboarding & Feedback Loop** — помощник инженерного стажёра от рабочей
цели до проверенного результата: разрешённый маршрут → заявка с подтверждением →
отдельное одобрение → IAM/DB evidence → blocker/buddy → повтор у второго стажёра →
Knowledge Gap Candidate с человеческим review. Accepted не публикует документацию.

В TL checkout локально сведены BE/AI/FE/QA поставки. **Локальный offline демопродукт готов: полный browser A/B/C путь и настоящий
restart проверены.** Текущие source SHA,
проверки и приоритеты — [TL readiness](docs/team/tl-readiness.md),
[backlog](docs/team/backlog.md). Старые S1–S4 не являются текущим планом.
Объединение выполнено локально в main; push/PR на GitHub не выполнялись.

React/TypeScript/Tailwind/TanStack Query/Zod → Go REST/SSE → Python/FastAPI и отдельный
corporate mock; PostgreSQL app/kb/corporate и pgvector. Только Go меняет app state;
AI предлагает и фильтрует знания по проверенному scope до LLM.
[Product Spec](docs/product/specification.md), [Architecture](ARCHITECTURE.md),
[ADR](docs/architecture/decisions.md), [восемь SDD](docs/features/README.md).

## Итоговая версия в main

Локальный `main` объединяет TL integration и проверенный финальный AI snapshot
`9b54700` с выбранным UI, streaming, метками AI/fallback и защитой check/version.
Собирать из корневой папки проекта на ветке `main`:

```sh
make main-demo
```

Это проверяет текущую ветку, пересобирает исходники main из подготовленного на этом
ноутбуке dependency cache и запускает http://localhost:15173. База и прогресс сохраняются.
На новой машине без cache использовать `make demo-up` после подготовки Docker/зависимостей.
LLM сейчас offline/mock; переключатель Live API означает Go API. Live LLM — отдельная
конфигурация с API key и бюджетом. Папка tmp/final-ai больше не является базой сборки.

## Локальная offline-демонстрация

Нужны Docker Engine/Desktop, Compose v2 и Python 3 для orchestration. Первый build
загружает образы/зависимости; после подготовки runtime не требует LLM/корпоративной сети.

На этой машине зависимости уже подготовлены; сборка и запуск без Docker Hub:

```sh
make demo-offline
```

На машине с доступной сетью обычная первичная сборка: `make demo-up`.

Отдельный проект `ai-buddy-demo-local`, сайт http://localhost:15173,
Go http://localhost:18080. Runner явно использует synthetic `.env.example`, mock LLM,
v2 seed → реальный kb ingest → /readyz → Go → UI. `.env` для этого запуска не читается.
Runtime DB-роли ограничены своими схемами; внутренние AI/mock/DB порты не опубликованы.
Новое demo-окружение не переносит старого intern-b между командами и не удаляет старые volumes.

```sh
python3 -m scripts.demo status
python3 -m scripts.demo ai-db-test --offline
# Только на отдельном свежем QA dataset, не перед показом:
python3 -m scripts.demo api-test --offline
make demo-down
```

`api-test` выполняет весь synthetic сценарий с реальным AI draft/SSE и предназначен
для свежего отдельного dataset. После него данные уже пройдены — это не начальный
экран чистой репетиции. Down сохраняет volumes. Для новой репетиции можно задать новый
`--project ai-buddy-demo-ИМЯ` (имя — lowercase ASCII). Параллельно порты должны быть свободны.
Reset с удалением данных выполняется только по явному решению владельца.

Стенд сразу открывается в Live API, восстанавливает cookie-сессию после refresh и
показывает четыре основные роли без технических суффиксов. Дополнительные аккаунты
для повторного затруднения и ACL доступны переключателем «Дополнительные участники». Чат на странице шага получает goal/step, показывает
AI proposal и точный preview; ручная кнопка запроса доступна при AI fallback.
Полная диагностика видна до отправки buddy. SSL disable/require выбирается явно.

Browser приемка: **4/4 PASS**, включая весь feedback loop, restart и отрицательные ACL.
FE: **475 tests, 94.34% lines**, AI DB: **5/5 PASS**, `make check`: **57 PASS**.
[Пятиминутный сценарий с точными кнопками](docs/product/demo.md).

Dockerfile.demo-offline копирует текущий код в самостоятельные images; исходники хоста
не монтируются. Нужны заранее доступные dependency images, перечисленные в scripts/demo.py
(они уже есть на этой машине). Полный cold build с пустым cache, remote CI и Go race
остаются отдельными проверками. Docker Hub сейчас недоступен; live LLM для demo не нужна.

## Live LLM и fallback

По поручению владельца порядок: `GigaChat/GigaChat-3-Pro` →
`ai-sage/GigaChat3.5-432B-A28B` → существующий deterministic offline provider.
Это точные ID из поставки AI; «GigaChat3.5Pro» не подтверждённый API ID.
Используются прежние OpenAI-compatible adapter, ACL retrieval и общий persistent budget ledger.

Для отдельного live запуска скопировать `.env.example` в `.env`, задать `LLM_MODE=live`,
`LLM_PROVIDER=openai`, `LLM_BASE_URL`, `LLM_MODEL=GigaChat/GigaChat-3-Pro`, `LLM_API_KEY`,
`EMBEDDING_MODEL=BAAI/bge-m3`, а также проверенные цены обеих моделей. Затем использовать
`make mvp-up` в отдельном Compose project с корректными APP_ORIGIN/портами.
`make demo-up` намеренно всегда offline. Бюджет 1000/stop 800 ₽, unknown usage сохраняет
резерв, budget refusal не вызывает вторую платную модель. Ключи только в env Python.

Первый фрагмент каждой live-попытки ожидается до 6s; полный буферизованный ответ
должен уложиться в общий лимит первого текста 20s с запасом для резервной модели.
После сбоя модель и query embeddings пропускаются на 30s; ошибочный partial не сохраняется. Общие 20/25/85/90s лимиты не увеличены. При сбое в самом чате появляется:

> Произошла ошибка обращения к LLM. Работает fallback. Обратись к своему наставнику напрямую для решения вопроса.

Offline явно помечен как ответ без LLM. Degraded ответ не создаёт action proposal;
серверные preview/confirm по-прежнему доступны отдельно. Публичные схемы не менялись.
Проверены local 503 обеих моделей, сохранение уведомления Go и настоящий Backend restart.
Paid вызовов в этом проходе нет; live safety/latency/cost требуют отдельной приемки.
[AI policy](docs/architecture/ai-design.md), [strategy](docs/AI_ENGINEERING_STRATEGY.md).

## Разработка и проверки

```sh
make install
make check
make mvp-preflight
make test
```

Host-run требует Node 26.13.0, Go 1.27.3, Python 3.12, uv 0.13.4. Go/mock tests требуют
отдельную seeded `buddy_test_*` БД: `TEST_DATABASE_URL`, `TEST_APP_PASSWORD`,
`TEST_MOCK_PASSWORD`, `MOCK_TEST_DSN`, `MOCK_TEST_ADMIN_DSN` и
`uv run --frozen python -m scripts.backend_test_db`. Они не должны работать на demo progress DB.
Конфигурация такой DB добавлена в CI; execution CI ещё не подтверждён.

Line coverage строго >80% отдельно: Go 80.98%, AI >99%, mock 98.05%, FE 94.34%.
Browser/API tests 4/4, AI DB 5/5, offline evals 29/29. Live/cold-build/CI
приемка отдельна. Host `make test` остановился из-за отсутствия Go; component Go checks выполнены
в локальном toolchain image, race detector остаётся открытым.
[Testing](docs/testing/strategy.md), [development](docs/operations/development.md).

## Синтетические роли и границы

V2 seed: intern-a/intern-b команды A → buddy-a; intern-c команды B → buddy-b;
approver-a назначен ресурсу db-team-a-test; docs-owner-a рассматривает его инструкцию.
Один JSON journey, db_reader, разрешённые IAM/DB checks без SQL/DSN. Не путать test DB
с внутренним PostgreSQL приложения. Restricted/private/team B документы нужны для ACL negatives.

Реальные корпоративные интеграции, HR, произвольные команды/SQL, автоматическая выдача
прав и публикация документации вне MVP. Public hosting требует отдельной auth/HTTPS и
отключения demo-login. [Демосценарий](docs/product/demo.md), [AGENTS](AGENTS.md),
[назначения](docs/team/assignments/README.md), [ветки](docs/team/branches.md).
