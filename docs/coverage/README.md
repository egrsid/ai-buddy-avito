# Отчёт о покрытии прикладного кода

Backend и frontend измерены локально 21 ноября 2026 года на версии со сдачей DB-задания.
Отчёты AI и corporate mock получены в GitHub Actions, запуск **43641861038** от 14 ноября.
Контрольные суммы исходников записаны в [манифесте](source-manifest.json).
В сводке Vitest пути к исходникам отсчитываются от корня репозитория.

| Компонент | Покрытые / учитываемые строки | Line coverage | Инструмент / исходный отчёт |
|---|---|---|---|
| Backend | 3048 / 3671 | **83,03%** | Go `test -race -coverpkg=./internal/...` + [line profile](backend.coverprofile) |
| AI | 3343 / 3450 | **96,90%** | pytest-cov / [Cobertura XML](ai.xml) |
| Corporate mock | 201 / 205 | **98,05%** | pytest-cov / [Cobertura XML](mock.xml) |
| Frontend | 1829 / 1912 | **95,66%** | Vitest v8 / [JSON summary](frontend-summary.json), [LCOV](frontend-lcov.info) |

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

## Результаты CI от 14 ноября

Backend vet/build/tests с race — PASS; AI 547 PASS и 5 DB skipped в unit job;
corporate mock 6 PASS; отдельные PostgreSQL/pgvector tests в Compose — 5 PASS;
runtime schema tests — 11 PASS; browser suite с реальным restart — 8 PASS.
Локальная независимая проверка того же runtime: frontend 630 PASS / 41 test files,
AI 547 PASS; тесты подготовки документации добавлены отдельно в shared suite.

CI не использует платный LLM-ключ. Live eval выполняется отдельно с собственным
ключом по инструкции тестирования. Фильтрация/fallback не означает, что любой
исходный ответ модели полезен. Полезность diff требует человеческого просмотра.
