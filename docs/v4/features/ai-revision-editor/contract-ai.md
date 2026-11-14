# AI-редактор ТЗ — контракт AI и поставка AI Engineer (V4-CONTRACT-AI-01, V4-EDIT-AI-01)

14 ноября 2026. Статус: **AI-часть реализована offline и проверена live-evals; предложение к G1**.
Схема: [`contracts/v4/ai.schema.json`](../../../../contracts/v4/ai.schema.json), тесты
`tests/test_contracts_v4_ai.py`. BE/FE consumer review и TL lock ещё не выполнены.
Go-часть (RevisionProposal, apply, TTL, CAS) — V4-EDIT-BE-01, ветка `feature/backend-v4`; вызов AI
приведён к этому контракту (`backend/internal/api/v4_revision.go`, схема `v4/ai/*` в Go).

## Как Go вызывает операцию

- Поля: только поле из отчёта — `goal`, `expected_result`, `sections/{id}/text` или все
  `acceptance_criteria/{id}/text` (до 6). `base_hash` — `content_hash` опубликованной версии,
  `affected_count` — `lifetime_count` отчёта (2…100), гипотеза v3 — если есть; `refs` пока пустой.
- Go перепроверяет ответ целиком: эхо `base_*`, путь из запроса, `old_hash` = SHA-256 текста поля,
  уникальные id/пути, замена непустая, не равна исходной, без `<`/`>`, в лимите поля
  (цель/результат 2000, раздел 4000, критерий 1000). Любое нарушение → `unavailable` + ручной текст.
- Публичный `RevisionProposal`: `field` = путь, плюс `label`/`rationale`; вопросы — строками;
  `no_change` → `needs_input` с пояснением; `answered_by=offline` → `origin=rule_based`.
- Таймаут вызова 60 с (две попытки модели по 25 с); общий клиент ждал заголовки только 5 с.
- Живая проверка 14.11 через Go API на live-стенде: ответ модели за 7.5 с.

## Операция

`POST /internal/v4/revision-draft` (Go → Python, тот же Bearer/X-Request-ID, лимит 64 KiB).
Вход `RevisionDraftRequest`: название ТЗ, `base_version` + `base_hash`, отчёт
(`section_id`, `reason`, `affected_count` ≥2, необязательная гипотеза v3), до 6 полей
`{path, label, text, hash}`, до 5 разрешённых документов, ответы автора на прошлые вопросы.
Пути только `goal`, `expected_result`, `sections/{id}/text`, `acceptance_criteria/{id}/text`.
Никаких ID стажёров, имён, чата, логов, Telegram.

Выход `RevisionDraftResponse`: `outcome` ready | needs_input | no_change, правки
`{id, path, label, old_hash, replacement, rationale}` (≤10), вопросы `{id, text, path?}` (≤10),
общее обоснование, `evidence_refs` (подмножество разрешённых), `origin`
`{mode, answered_by: primary|secondary|offline, reason_code?}`. Поля совпадают с FE
`ProposalModel` (id/label/before=текст поля/after=replacement/rationale).

## Смысловые правила (схема их не выражает; Python проверяет, Go обязан перепроверить)

Запрос → 422 `VALIDATION_ERROR` с `fields`: повтор пути (`fields/unique`), hash не равен
SHA-256 текста (`fields/hash`), ни одно поле не относится к разделу отчёта (`report/section`),
повтор документа (`refs/unique`). Ответ: путь и `old_hash` из запроса, по одной правке на поле,
id уникальны, ссылки только из запроса, `base_*` эхом, замена не равна исходному тексту.

## Защита (V4-T09, V4-T10, V4-T13)

- До модели: из названий, текстов, документов и ответов автора убираются секреты/контакты,
  HTML и пункты, похожие на команды модели (provider-input spy в тестах).
- Ответ модели целиком отклоняется при инструкции модели, секрете/контакте, оценке людей,
  чужой ссылке, битом JSON. Отдельная правка отбрасывается, если путь не из запроса,
  есть разметка/плейсхолдер `<дата>`, пустая/длинная замена или **новые факты**: числа,
  даты/дни недели, URL, латинские названия систем, права доступа, которых нет в ТЗ и ответах
  автора. Вместо отброшенной правки сервис задаёт автору вопрос; обоснование модели заменяется.
- Модель недоступна / бюджет / таймаут / негодный ответ → явный шаблон без модели
  (`answered_by=offline` + `reason_code`): вопросы по признакам неясности или ответы автора,
  дописанные в раздел без изменений. Шаблон не выдаётся за ответ модели.
- Лимит ответа модели для этой операции 1000 токенов (`LlmInput.max_output_tokens`);
  журнал расходов резервирует цену по этому же лимиту. Таймеры 20/25/85/90 не менялись.

## Проверки

- Контракт: 36 тестов (валидные/невалидные примеры, без сетевых `$ref`).
- AI unit: 44 теста модуля; весь AI-компонент 531 PASS, покрытие строк 96.94% (порог 82%).
- Evals `evals/revision_draft_cases.json`: 26 кейсов, из них 12 safety.
  Шаблон: 26/26, safety 12/12 (`evals/report-revision-draft-mock.md`).
  Live GigaChat-3-Pro → GigaChat3.5 (14.11, ~26 вызовов): ответ модели 24/26, safety 11/12;
  автору ушёл безопасный черновик в 12/12 (`evals/report-revision-draft-live.md`).
  Это dev-eval, не actual-live acceptance V4-T21.

Запуск: `cd ai-service; uv run --frozen python -m app.revision_draft_evals [--live]`.

## Ограничения

- Регулярные проверки не ловят выдуманные **русские** детали («окно оболочки», «система
  контроля версий»): поэтому применение — только после просмотра diff автором (V4-EDIT-FE-01).
- Модель иногда отвечает не-JSON или повторяет оценочные слова из текста — тогда шаблон.
- Добавление/удаление критериев не предлагается (только замена текста существующих полей).
- Проверка hash и путей в Python не заменяет CAS/TTL/re-authorization в Go при apply.
