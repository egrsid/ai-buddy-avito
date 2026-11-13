# Статистика затруднений для наставника и владельца документов — design v3

Target proposal, не executable schema/runtime. [Spec](spec.md).

Go считает агрегаты по app событиям и назначениям. Python не считает статистику и не
получает сырые таблицы; AI-пояснение графиков не входит в P0. ACL применяется ДО join/group/
count/сортировки/pagination, включая label/refs/summary totals. Для mentor cohort нужны
назначение на момент события и текущее право чтения; owner ТЗ видит только scope своего ТЗ.
После переназначения/revoke прежний scope не кэшируется. Documentation-owner получает только
свои docs/versions и события с проверенной attribution, не текст закрытого документа.

Два типа источников: trusted failed check/friction (check/event ID, время, нормализованный
safe code, journey/step/instruction version) и structured TaskFriction (accepted contribution,
server validated assignment/section/version/reason). Сбой LLM/Telegram/transport — отдельная
operational категория, не проблема стажёра/качества инструкции; не смешивать с business stats.
Нераспределённая причина/отсутствующий document ref не приписывается owner автоматически.

Метрики: affected = distinct разрешённых intern внутри разреза/периода; technical occurrences
= distinct принятых check IDs (честные повторы check увеличивают attempts, не affected);
task observations = distinct accepted contribution IDs по правилам TaskFriction (повтор
отправки/клика не добавляет наблюдение). Обновление last_seen не копирует историческое
наблюдение в новые окна. Для task observation использовать accepted/first_seen timestamp,
а report active-count использует свой last_seen/window: обозначить различие на UI.
Одно check событие, связанное с несколькими документами, не дублирует общий total;
counts отдельных групп могут пересекаться, суммы unique counts не аддитивны.
Открытые blockers — состояние на as_of среди выбранных scoped наблюдений, не число failures;
review state кандидата не равен technical resolution. Длительность устранения/оценка людей — P1, не вычислять из Telegram или предположений.

Доля affected/exposed показывается только при наличии надёжной scoped экспозиции данной
версии задания/инструкции в периоде; denominator = distinct разрешённые стажёры, которым
выдана/показана именно эта версия. Если history exposure отсутствует (в том числе v2),
показывать denominator=null/«нет данных», а не проценты по всему штату. denominator=0 →
не вычислять процент. Эта доля не входит в обязательный P0 до готовности exposure данных.
Хранить наблюдения UTC; диапазон [from,to), дневные buckets с согласованным timezone
(начальный Europe/Moscow), metadata timezone/as_of/window/source_kind в response.
Trend comparison только сопоставимые окна и версии; отсутствующая history — «нет данных».

Проектируемые read-only Go endpoints: GET /api/v3/statistics/mentor и /documentation
с allowlisted filters/cursor/limit <=50, as_of и server-derived scope, bounded from/to;
ответ summary, rows, daily buckets, suppressed flags, next_cursor. Model names/keys/PII,
переданный клиентом mentor/owner_id и arbitrary group_by запрещены. Errors/401/404/409/
validation согласует контракт. Статистика read-only, запрос не создаёт event/report/action.
Повтор одного запроса не добавляет observations. Если parent total позволяет вычислить
хотя бы одну suppressed child cell, parent total/доля тоже suppressed; сравнение окон
не должно восстанавливать эту cell. Детерминированные suppression fixtures принимает QA. Paging/sort стабильны на as_of; при
revoke scope перечитать без раскрытия прежних totals. Кеш — по subject/full scope/filter/
policy revision/as_of, с re-authorization; без готовой invalidation политики P0 cache off.

Новые нужные attribution/exposure поля — только новые миграции BE после contract gate;
старые данные не backfill выдуманными показами/assignments. Фиксированный synthetic dataset
должен давать ожидаемые counters, duplicate и window-boundary примеры для BE/FE/QA.

[Общие границы](../../v3/architecture.md), [задачи/owners](../../v3/delivery.md).
