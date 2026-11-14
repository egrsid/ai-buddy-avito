# Эффект исправлений — design v4

Target proposal; [spec](spec.md), [общая архитектура](../../architecture.md).

## Правила расчёта (baseline для G1)

1. Policy revision хранит H=7×24 часа и min cohort=5. Время server UTC; UI отображает
   Europe/Moscow. as_of фиксируется для всего comparison и pagination.
   Impact-config фиксирует enrollment диапазоны [from,to) отдельно для A/B (каждый ≤90
   суток UTC), версии/section/reason и policy revision. Включение episode определяется
   его start внутри диапазона. Изменение диапазонов создаёт новую config revision;
   GET не принимает произвольный intern filter или ad-hoc cohort. Все counters, cursors
   и ограничения относятся к одной config revision/as_of. После каждой reconfiguration
   suppression проверяется заново; P0 не обещает абсолютной анонимности от многих запросов.
2. Берутся первые достоверные exposure episodes после включения v4. Episode начинается
   assigned/adopted событием; заканчивается при adopt/revoke/archive/team change. Нет
   события начала — unknown, не backfill. Прекращённый раньше H episode исключён с причиной.
3. Eligible — distinct interns с полностью завершённым H-окном одной версии до as_of,
   при текущем разрешённом scope и разрешённом scope в момент события. Повторное назначение
   не создаёт вторую экспозицию. Пережившие обе версии interns исключены из обеих когорт
   этого сравнения: обучение может исказить результат; число исключённых также privacy-filtered.
4. Affected — eligible interns с first accepted contribution для того же section/reason
   в [episode.start, episode.start+H). last_seen repeat не переносит contribution в другое
   окно. Unique IDs и distinct intern dedup на сервере. numerator ≤ denominator.
5. Rate=affected/eligible; delta_pp=100×(rate_B−rate_A), без округления до расчёта разности.
   Показ до 1 decimal, отрицательное значение — меньше зарегистрированных затруднений.
   Нет CI/p-value/«доказано» и процентов снижения относительно нулевого baseline.
6. Eligible<5 → insufficient_data; numerator или complement=eligible−affected в (0,2)
   → suppressed. Нулевой numerator допустим при известной полной когорте≥5, с подписью
   «не зарегистрированы», не «не возникали». Если сторона suppressed — её denominator,
   rate, delta и связанные totals/exclusions подавляются, исключая восстановление вычитанием.
7. Данные с неизвестными scope/exposure/semantics исключаются, counts причин подавляются
   теми же правилами. Отсутствующая история не превращается в нулевую проблему.

## Контрольный пример

Synthetic A: 10 eligible, 6 affected; B: 10 других eligible, 2 affected.
Ожидание 60%, 20%, delta −40 п.п. Это иллюстрация формулы, не измеренный эффект продукта.
Репродуцируемый harness создаёт accepted события/эпизоды на test clock с provenance;
не пишет исторические события в пользовательскую demo DB. Boundary кейсы — в testing.

AI suggestions/review state и закрытие blocker не входят в numerator. Technical charts
v3 остаются отдельными; эффект изменения инструкции требует отдельной future exposure model.

Schemas/migrations и публичные поля принимаются в V4-CONTRACT-01, не этим Markdown.

Сравнение указывает число/причины исключений с privacy rules и предупреждает о возможном
смещении выборки из-за early adoption/revoke. Событие входит только если received_at≤as_of;
поздние события видны в следующем snapshot, не меняют страницы текущего. При отсутствии
received_at trust history сравнение не рассчитывается до согласованного правила G1.
