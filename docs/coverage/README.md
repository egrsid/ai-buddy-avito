# Отчёт о покрытии прикладного кода

Измерение: Backend и corporate mock — GitHub Actions `checks`, run **43641861038**,
14 ноября 2026 (их измеряемые исходники с тех пор не менялись). AI и frontend
перемерены 15 ноября 2026 после правок по внешней проверке теми же component runners,
что в CI (`scripts.check_components ai`, Vitest coverage в `node:26.13.0`).
Сохранены исходные отчёты инструментов, а не вручную составленный процент.
SHA-256 каждого измеренного исходника в [source-manifest.json](source-manifest.json)
проверяется автоматически (переводы строк CRLF из Windows-checkout приводятся к LF,
как в репозитории).
История Git может менять commit IDs, поэтому соответствие устанавливается по содержимому файлов.

| Компонент | Покрытые / учитываемые строки | Line coverage | Инструмент / исходный отчёт |
|---|---|---|---|
| Backend | 2975 / 3594 | **82,78%** | Go `test -race -coverpkg=./internal/...` + [line profile](backend.coverprofile) |
| AI | 3363 / 3470 | **96,92%** | pytest-cov / [Cobertura XML](ai.xml) |
| Corporate mock | 201 / 205 | **98,05%** | pytest-cov / [Cobertura XML](mock.xml) |
| Frontend | 1811 / 1889 | **95,87%** | Vitest v8 / [JSON summary](frontend-summary.json), [LCOV](frontend-lcov.info) |

Все четыре компонента превышают требование кейса **>80%**; независимый gate проекта —
**≥82%**. [Машинная сводка](summary.json) сопоставляется с исходными профилями.
Проценты не усредняются между компонентами; denominators и exclusions не менялись.

## Воспроизвести пересчёт сохранённых данных

```sh
uv sync --frozen
uv run --frozen python -m scripts.verify_coverage
```

Проверка отклоняет изменённый измеренный исходник, несовпадение raw report/summary
или недостаточное покрытие любого компонента. Это пересчёт сохранённого измерения,
а не новый запуск тестов. Для нового измерения выполните [component runners](../testing.md).

## Область измерения

- Go: бизнес-модули `backend/internal/...`; stdlib/зависимости, tests и `cmd/api` wiring
  не входят. Statement blocks консервативно переводятся в строки существующим
  [алгоритмом](../../scripts/go_coverage.py): строка с несколькими блоками покрыта,
  только если выполнены все блоки.
- Python: `app` и `corporate` независимо; исключены tests, `__init__.py` и startup
  `main.py`, как задано в [pyproject.toml](../../pyproject.toml).
- Frontend: `src/**/*.{ts,tsx}`, кроме entrypoint `main.tsx`, tests и деклараций типов;
  правила в [vite.config.ts](../../frontend/vite.config.ts).
- Общие orchestration scripts, зависимости и сгенерированные файлы не выдаются
  за прикладное покрытие этих четырёх компонентов; shared tooling имеет свои tests.

## Остальные результаты того же CI

Backend vet/build/tests с race — PASS; corporate mock 6 PASS; отдельные
PostgreSQL/pgvector tests в Compose — 5 PASS; runtime schema tests — 11 PASS;
browser suite с реальным restart — 8 PASS. Перемер 15 ноября: AI 551 PASS и 5 DB
skipped, frontend 632 PASS / 42 test files.

CI не использует платный LLM-ключ. Live eval выполняется отдельно с собственным
ключом по инструкции тестирования. Фильтрация/fallback не означает, что любой
исходный ответ модели полезен. Полезность diff требует человеческого просмотра.
