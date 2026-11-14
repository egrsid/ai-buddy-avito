# Финальная локальная v4 — проверка 14 ноября 2026

Последующее UX-уточнение и подготовка main: [результат изменений](ux-release-2026-11-14.md),
[сценарий защиты](../../JURY_DEMO_V4.md). Fixtures/ссылка на прототип убраны из сайта;
старый /v4-preview открывает реальный раздел. Упоминание отдельного прототипа ниже историческое.

Live: http://localhost:15180. Когорты: http://localhost:15181.
[Полная инструкция команды и защиты](../../TESTING_FINAL_V4.md).
Рабочая база — feature/tl-v4, коммит другого участника 4667e1e поверх 5be020e.
Публикация/PR/изменение main не выполнялись. Существующие volumes не удалялись.

## Что уже поставлено и согласовано технически

В 4667e1e включены BE/AI/FE, additive migrations 011–014, реальные Go producers
contracts/v4/events.schema.json, закрытый public/AI consumer, пагинация workspace и
timeline с receipt snapshot, повторная ACL при replay, генерация после commit без
удержания app transaction, generation token/полная brief revision, pinned preview,
защита stale apply и late completion, ручная публикация. Синтетический clock допускается
только явным local/test config; публичного setter нет, rewind не допускается.
Legacy receipt/exposure история не выдумывается. Разрешение intern-a, отозванное отрицательным
тестом, восстанавливается только cleanup в изолированной test DB.

Операторский harness создаёт 20 synthetic участников и две версии через бизнес-API,
а не правкой timestamps существующей пользовательской БД. Получены реальные Go counts
10/6 и 10/2, 60%, 20%, −40 п.п.; результат явно помечен test clock. Scenario replay
сохраняет данные. Прототип /v4-preview остаётся отдельным.

## Доработки текущей проверки

- Live runner исправлен по фактическим API contracts: SSE Accept text/event-stream;
  origin completion=complete при run status=completed. Добавлен regression assertion.
- Интервал между paid runs ≥13 секунд соблюдает Go limit 5/min; лимит сервера не ослаблен.
  Тестовый аккаунт intern-i выбран отдельно от существующих queued run intern-d.
- Экспорт revision evals направлен в writable /tmp и затем .cache; раньше контейнер
  успешно делал запросы, но не мог сохранить отчёт в read-only каталоге исходников.
  Добавлен тест output path. Исходники контейнера не делались writable ради отчёта.
- README/SDD pointers и корневая инструкция обновлены с исторического offline-статуса
  на actual live. Ключ остаётся только в ignored .env.live-v4, mode 600, вне Docker context.

## Наблюдённые проверки

| Проверка | Результат |
|---|---|
| Cloud.ru /models | Ключ принят; primary, secondary и BAAI/bge-m3 доступны |
| Actual primary через Go | **10/10 PASS**, completed + primary/complete, ACL-revalidated citations, correlated actual usage |
| Latency sample | Максимум first content 1.043 с; это выборка, не production p95 |
| Цена десяти run | 2.99782569 ₽ с query embeddings по persistent ledger; не счёт из консоли провайдера |
| Реальная Go→AI правка | Primary, ready; diff просмотрен; apply в draft, затем отдельная публикация v2 PASS |
| Live revision evals | raw 24/26, raw safety 11/12; served guard/fallback safety **12/12**, новый отчёт сохранён |
| AI PostgreSQL/pgvector | **5/5 PASS** в отдельном QA project |
| Live browser chat | Реальный ответ и метка «Сгенерировано ИИ» PASS, без API interception |
| Full browser QA | **8/8 PASS**, real restart, ACL, v3 regressions, v4 mobile/keyboard |
| Browser cohort project | **1/1 PASS**, real comparison API и 20 участников |
| Shared make check | **187 PASS**, docs/schema/SQL/YAML/lint/format |
| Frontend | build PASS; **623 tests**, **95.82%** lines |
| Go | vet/tests PASS; **2916/3537 = 82.44%** lines (statement 82.3%) |
| AI | **541 PASS**, **96.86%**, 5 DB cases проверяются отдельно |
| Corporate mock | **6 PASS**, **98.05%** |

Источник live evidence: .cache/v4-live-acceptance.json и
.cache/v4-go-revision-result.json; без ключей/cookie/текстов переписки. Первый запуск
runner выявил ошибки самого harness, они исправлены; неуспешные попытки не включены
в 10/10. Журнал расходов не сбрасывался, неизвестный reserve сохранён.

## Границы результата

Это работающий локальный runtime v4 с настоящей LLM и отдельной synthetic историей.
Formal independent contract approval, cold build и remote CI не объявляются выполненными.
Попытка подготовить Go race compiler остановилась на сетевой ошибке загрузки Alpine gcc;
обычные vet/tests и независимый ≥82% gate прошли, race остаётся OPEN.
Автоматический редактор отчёта acceptance_criteria ограничен первым критерием; остальные
доступны в обычном human editor. Полезность model diff всегда требует просмотра автором;
guards и отсутствие опасного output не доказывают отсутствие всех смысловых галлюцинаций.

Actual auth/429/timeout/cancel/budget/cooldown failure branches покрыты fake-provider
unit tests; не выдаются за наблюдавшиеся сбои Cloud.ru. Corporate IAM/DB synthetic.
Результаты когорт — описательное сравнение тестовых групп, не измеренный эффект продукта.

При диагностике автоматическая проверка отклонила массовую отмену queued run intern-d
как слишком широкую операцию. Отмена не выполнялась; безопасная альтернатива — отдельный
аккаунт intern-i. Данные существующих запусков сохранены.

Финальный live restart PASS: опубликованная v2 сохранилась. До/после restart журнал
показал одинаковые 14.13 ₽, 99 reservations, 1 unknown reserve; неизвестный резерв
не удалялся. Это локальный консервативный учёт, не подтверждение оплаты в Cloud.ru.
