# V4 — доказуемое улучшение онбординга

14 ноября 2026. Статус **PLANNED, runtime v4 отсутствует**. Ветка документации:
`docs/v4-planning`, база `feature/local-v3-integration` **f4f63a0**. Main b6f940d — v2;
реализованная v3 сохраняется. Никакой push/PR, реализации или изменения demo DB этим пакетом.

Цель: показать, как помощь конкретному стажёру становится проверяемым улучшением для
следующей группы. Это развитие v3, а не замена feedback loop новым чат-ботом.

Порядок источников: прямое поручение владельца → [продукт](product.md) → SDD ниже →
[архитектура/контрактные предложения](architecture.md) → [delivery/handoff](delivery.md) →
[приёмка](testing.md). [Решения и открытые вопросы](decisions.md), [демонстрация](demo.md).
Имена DTO/endpoints ниже — предложения для contract gate, не существующий API.

| Идея | Спецификация / дизайн / задачи | Главный результат |
|---|---|---|
| Эффект исправлений | [spec](features/improvement-impact/spec.md), [design](features/improvement-impact/design.md), [tasks](features/improvement-impact/tasks.md) | Две версии, сопоставимые наблюдения и честные ограничения |
| AI-редактор | [spec](features/ai-revision-editor/spec.md), [design](features/ai-revision-editor/design.md), [tasks](features/ai-revision-editor/tasks.md) | От гипотезы к diff, human draft и отдельной публикации |
| Рабочее пространство | [spec](features/intern-workspace/spec.md), [design](features/intern-workspace/design.md), [tasks](features/intern-workspace/tasks.md) | Цель, связанное ТЗ, blocker и следующий шаг в одном контексте |
| Доказательства | [spec](features/evidence-timeline/spec.md), [design](features/evidence-timeline/design.md), [tasks](features/evidence-timeline/tasks.md) | Объяснимое состояние по доверенным событиям |
| Проверяемое AI-демо | [spec](features/demonstration-proof/spec.md), [design](features/demonstration-proof/design.md), [tasks](features/demonstration-proof/tasks.md) | Полезность AI, ACL-отказ и отказоустойчивость без подмены фактов |

## Что уже есть

В v3: DB journey, заявки/confirmation/approval/IAM/check, trusted progress, Telegram
preview/export, версии ТЗ/назначения/adopt, отдельные task clarity и docs candidates,
scoped статистика и server origin. Исправлены повторы целей/назначений, UX вопроса,
добавлены synthetic участники. [Фактический checkpoint](../v3/integration-acceptance-2026-11-14.md),
[ручная проверка v3](../../TESTING_V3.md). Некоторые старые SDD содержат исторические TODO.

Пробелы: нет сравнения экспозиций версий, применения AI diff в draft, явной связи ТЗ/цели,
единой timeline доказательств и новой локальной actual-live приёмки. Метрики v3 не являются
доказательством экономии времени или причинного эффекта. Старые авторские live evals
сохраняются как отдельные отчёты, не гарантируют качество текущей сборки.

## Как начать

Каждый читает README → product → свой SDD → architecture → delivery → testing.
BE/AI готовят исполняемые контрактные предложения; FE — consumer review; QA — ожидаемые
результаты и отрицательную матрицу. Runtime после G1, не на расходящихся DTO.
Все пять направлений входят в v4; последовательность и gates заданы в delivery.
Отсутствие ключа не останавливает offline-разработку, но actual-live gate остаётся OPEN.

## Проверка документационного пакета

14 ноября: `make check` PASS (103 shared tests, local links, legacy/v2 schemas,
SQL/YAML, lint/format). Дополнительно: пять полных SDD-комплектов, 20 backlog IDs,
ссылки зависимостей на существующие задачи, DAG без циклов, `git diff --check` PASS.
Все 32 изменённых/новых файла — Markdown; ветка docs/v4-planning. Runtime v4,
контейнеры, executable contracts, миграции, seed и env не изменялись/не запускались.
Это DONE для V4-DOC-01, остальные gates/задачи остаются PLANNED/TODO/OPEN.
