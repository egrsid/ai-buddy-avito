# Наблюдения по версиям и проверка эффекта — спецификация

## Цель и предусловия

Один owner TaskBrief, версии A < B, стабильные section_id/reason и явное подтверждение сопоставимости смысла. Scope проверен; config фиксирует диапазоны enrollment.

## Пользовательский сценарий

Автор настраивает сравнение → Go выбирает завершённые exposure episodes → считает distinct eligible/affected → применяет suppression → UI показывает rates/delta/ограничения либо insufficient_data/not_comparable.

## Правила и критерии приёмки

- **IMPACT-01.** Окно H = 7×24 часа; cohort — distinct interns с полным H до as_of. Неизвестная/недостоверная история не backfill и не ноль.
- **IMPACT-02.** Episode начинается с trusted assigned/adopted, прекращается при adopt/revoke/archive/team change. Прерванный раньше H исключается; получившие обе версии исключаются из обеих когорт.
- **IMPACT-03.** Affected — eligible с first accepted contribution того же section/reason внутри [start,start+H). Дубли и repeat last_seen не переносят вклад в окно.
- **IMPACT-04.** Rate = affected/eligible; delta_pp = 100×(rate_B−rate_A). Сначала расчёт без округления, показ до одного decimal. Numerator не больше denominator.
- **IMPACT-05.** Eligible <5 даёт insufficient_data. Numerator или complement в (0,2) подавляют сторону, производные delta/totals/exclusions, чтобы не восстановить число вычитанием.
- **IMPACT-06.** Только текущий owner видит свой comparison. Нет arbitrary intern filter, cross-team aggregate или смешения technical/task semantics.
- **IMPACT-07.** Snapshot фиксирует config revision/as_of и received_at cutoff; новый поздний факт виден в следующем snapshot, не меняет текущие страницы.
- **IMPACT-08.** Результат описательный: различия групп могут повлиять. Синтетический test clock разрешён только operator local/test, явно подписан и не меняет пользовательскую demo БД.

## Контрольный пример

A: 10 eligible/6 affected; B: 10 других eligible/2 affected → 60%, 20%, −40 п.п. На свежей БД без H-истории результат insufficient_data.

[Дизайн](design.md) · [Реализация и проверки](tasks.md) · [Общий scope](../../requirements.md).
