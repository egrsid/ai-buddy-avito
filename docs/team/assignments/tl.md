# Назначение: Tech Lead

Участник: владелец проекта. Ветка: **feature/team-start-foundation**, существует.
[Backlog](../backlog.md), [ветки](../branches.md), [общие правила](../working-agreements.md).

## Выполнено в текущем поручении

RP-TL-01: пять ролей и reviewers назначены, зоны/задачи и рабочие ветки описаны;
Fullstack ограничен одним RP-QA-01. RP-CONTRACT-TL-01: зафиксированы общая архитектура,
protocol/schema policy, synthetic resource/role/document ACL, evidence/idempotency,
acceptance/negative cases и authors в [contract-baseline](../../architecture/contract-baseline.md).
Это реально подготовленный TL-пакет; не получены reviews других людей и не написаны их schemas.
RP-TEAM-01 отслеживает проверку/завершение этого документационного распределения.
Дополнение RP-TL-AI-01: [AI integration policy](../../architecture/ai-integration-policy.md)
фиксирует internal Error/ID, таймауты/heartbeat/faults/sources и инфраструктурные требования.
Это решения TL; Docker/CI/UTF-8/manifest изменения кода ещё не выполнены.

## Первая передача команде

- Backend: RP-CONTRACT-BE-01 — все общие/public/journey/events/corporate schemas/examples,
  общий offline validation helper и соответствующие tests.
- AI Engineer: RP-CONTRACT-AI-01 — input/output/structured/knowledge/AI SSE schemas/examples.
- Frontend: RP-CONTRACT-FE-01 — consumer review и typed parsing, после BE/AI файлов.
- Fullstack: только RP-QA-01 в уже существующей QA-ветке, после новой базы и API поставки.

Файлы/DoD/порядок в [contract-handoff](../contract-handoff.md). Backend и AI не требуют
от TL выбора внутренних библиотек. TL рассматривает только cross-component/API/security изменения.

## Очередь оставшейся работы TL

| Задача | Вход | Объём / результат |
|---|---|---|
| RP-CONTRACT-REVIEW-01 | BE/AI schemas и FE review | Сверить common refs/scopes/fields/errors/events, запустить offline contract checks; записать реальный accepted baseline |
| RP-INF-01 | Доступный Docker | Startup/Compose/CI, contracts COPY, one-shot ingest и AI DB test runner после поставки CLI/tests AI; role isolation, отдельная demo-БД без reset нужного volume |
| RP-DATA-TL-01 | Новые app/corporate/kb migrations и fixture IDs | Общие migrate/seed/check/verify-db scripts, explicit UTF-8/non-ASCII hash test; repeat не стирает progress, checksum preserved |
| RP-INTEGRATION-01 | Все компонентные поставки, FE E2E, небольшой QA smoke | Свести окружение и реальные full-path/security/offline/restart/coverage отчёты; ошибки отправить владельцу кода |
| RP-DEMO-01 | Принятый P0 и требования сдачи | Чистая репетиция, README, PDF/video, обозначение mock/live |
| RP-TL-02 | Оригинальные требования/сроки | Подтвердить coverage/формат сдачи; не придумывать отсутствующие источники |

RP-HOST-01/RP-P1-01/RP-P2-01 только после/вне P0. Бюджет/key live согласуется отдельно,
offline P0 не ждёт provider. Личные handles/права/публикация остаются у владельца.

## Зона и review

Общие docs/team/architecture policy, scripts/infra/Compose/CI/root tooling. Точечное
исключение: Backend обновляет scripts/check_repo.py только для v2 validation; предварительно
согласовать момент, чтобы не править файл одновременно. Не писать за BE/AI/FE их бизнес-логику.
Технический приёмочный gate TL закрывает после предъявленных файлов/проверок, не заранее.
AI предоставляет commands/env/runtime deps и отчёт evals; TL принимает данные, меняет
общие README/.env.example/pyproject.toml/uv.lock и CI только на их основе. Ключ/бюджет
TL подтверждает до платного RP-AI-02, сейчас конкретные значения неизвестны.

## Проверки/передача

Для docs: make check, local links/IDs/dependency DAG, git diff --check. Для будущих tooling
changes — tests/Makefile по области, для INF — реальные up/migrate/seed/verify-db/smoke.
Эта задача контейнеры не запускает: пользователь поручил назначения и TL-часть контракта.
Коммит/push/подготовку остальных веток выполняет владелец вручную после просмотра результатов.
