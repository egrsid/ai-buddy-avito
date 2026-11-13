# Аудит веток и готовности v3 · 14 ноября 2026

Проверены `git fetch origin --prune`, `git ls-remote --heads origin`, история и
деревья опубликованных веток. Это review исходников, не runtime-приёмка v3.
Текущий checkout: `docs/v3-planning`, `6016d37`; main сохранён.

## Все опубликованные ветки

| Ветка | SHA | Результат |
|---|---|---|
| main | b6f940d | Канонический v2 |
| docs/v3-planning | 6016d37 | План шести направлений v3 |
| feature/ai-v3 | 109e33b | Исправление истории primary LLM, live launcher, диагностика |
| feature/backend-v3 | 2ace307 | Включает AI v3; новые contracts, migrations, API, task clarity AI |
| feature/ai-mvp-v2 | 9b54700 | Прежняя поставка v2 |
| feature/backend-mvp-v2 | ea2cfbe | Прежняя поставка v2 |
| feature/frontend-mvp-v2 | c814283 | Прежняя поставка v2 |
| feature/qa-01-m1 | f88228c | Прежняя поставка QA |
| feature/team-start-foundation | b0e5529 | Прежняя foundation |

Отдельных frontend-v3/qa-v3/tl-v3 remote branches нет. Дерево `frontend/`
в backend-v3 совпадает с main: новый пользовательский интерфейс не поставлен.
Первый fetch вывел предупреждение о недоступном старом объекте `25ac58f`, но завершился
с кодом 0; актуальные heads дополнительно сверены через ls-remote и прочитаны локально.

## Сопоставление с планом

| Направление | Есть в опубликованном коде | Остаток |
|---|---|---|
| Telegram | Contact/preview/export, retirement внутренних обращений | FE, scoped export и retirement E2E |
| Версии ТЗ | Draft/publish/archive/assign/adopt, новые миграции | Редактор/назначения/preview перехода в FE, consumer review |
| Понятность ТЗ | Friction/report/review, AI hypothesis и 24 eval cases | FE, полная приёмка distinct/window/concurrency/restart |
| Цели | Go summaries/pagination/progress | Раскрываемые карточки, multi-goal UI и accessibility |
| Live LLM | Исправления prompt/history, live launcher, server origin | FE origin, повторная интеграционная и fault-приёмка |
| Статистика | Go mentor/documentation aggregation | Исправления ниже, фильтры и два UI dashboard |

AI-отчёт `docs/operations/llm-diagnosis.md` в ai-v3 заявляет 10/10 primary на
стенде автора; это не новый прогон на данном компьютере. Отчёт task clarity в
backend-v3 указывает mock 24/24, live 21/24 и safety 11/11. Полную v3-приёмку
по этим результатам закрывать нельзя.

## Конкретные расхождения для исправления

1. `backend/internal/api/v3_stats.go`: `statParams` принимает только days/source/
   cursor/limit; фильтры journey/step/brief/version/section/reason/status из SDD отсутствуют.
2. `aggregate` суммирует число items каждой группы и считает daily по key+item.
   Одна техническая проверка с несколькими документами может повторно учитываться
   в общем total/daily. План требует distinct check ID на уровне общего счётчика.
3. Cursor статистики — offset; as_of вычисляется заново для каждой страницы.
   Стабильная pagination на фиксированном as_of пока не обеспечена.
4. Technical scope использует текущее `users.buddy_id`; план требует также назначения
   на момент события. Необходимы достоверная attribution/history и отрицательные тесты;
   нельзя выдумывать исторические назначения backfill-ом.
5. `GET /api/v3/task-briefs/{id}` доступен только buddy-owner, assignment отдаёт
   закреплённый content и номер последней версии. Стажёру нужен разрешённый preview
   новой версии до adopt; инструкция брать его из TaskBrief пока не покрывает его ACL.
6. Frontend v2 сохраняет внутреннюю очередь/ответы, тогда как backend-v3 отключает
   соответствующие записи. Один перенос сервера оставит несовместимый UX.

Это найденные расхождения, не исчерпывающий security review. V3-T01…T30,
component coverage и Go↔AI↔FE acceptance остаются открыты до фактических прогонов.

## Локальная среда и ограничения прохода

Docker Engine 29.9.3 доступен. Пять существующих контейнеров ai-buddy-demo-local
(frontend/backend/AI/mock/PostgreSQL) healthy; UI опубликован на localhost:15173,
Go на localhost:18080. Это существующий v2, не сборка новых веток.
Контейнеры/volumes не удалялись; migrations v3 на demo DB не применялись.

Переданные AGENTS инструкции ограничивают текущую задачу Markdown и запрещают runtime
изменения. У владельца отдельно запрошено снятие ограничения для локальной интеграции
и завершения v3. До ответа код и ветки компонентов не изменяются. Push/PR не выполнялись.

Следующая база интеграции после разрешения: отдельная локальная ветка от проверенного
backend-v3 (уже включает ai-v3), с сохранением main и изолированной v3 БД. Далее
исправления контрактов/BE, FE implementation, component/E2E/restart проверки и запуск v3.
