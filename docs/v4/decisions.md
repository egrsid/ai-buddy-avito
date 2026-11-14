# Решения и неопределённости v4

Статус: proposed design для consumer review, не получение approval молчанием.

| ID | Baseline решения | Причина |
|---|---|---|
| V4-D01 | Пять идей составляют один цикл; v3 сохраняется | Не дробить продукт на несвязанные панели |
| V4-D02 | Первый AI diff только TaskBrief, не kb | Есть immutable versions и human publish; docs owner flow регрессируется |
| V4-D03 | Первый impact только task clarity | У v3 нет надёжного exposure denominator для исторической документации |
| V4-D04 | Экспозиция = серверное назначение/adopt версии, не «пользователь прочитал» | Назначение можно доказать; чтение/понимание не выдумывать |
| V4-D05 | Workspace link явный, template выбран автором и принят intern | Сходство названий не доказывает связь или разрешение |
| V4-D06 | Timeline не выдаётся наставнику по одной роли/team | Личная история не равна разрешённому handoff snapshot |
| V4-D07 | Изменения API additive /api/v4, стеки/schema owners прежние | Не сломать Go consumers v3 |
| V4-D08 | Baseline comparison: 7 суток наблюдения, min 5 distinct на версию | Практичный старт для описательного demo, не доказательство значимости |
| V4-D09 | Paid live gate отдельный, текущий выбор offline сохраняется | План не является разрешением тратить бюджет |

До G1 TL + BE/AI/FE фиксируют exact schema names, permission codes, proposal hash/TTL,
обработку ограничений criteria и semantics pagination. Настройки 7 суток/min5 должны
стать server-owned policy revision, не произвольными UI фильтрами; изменение — через review.
До live gate владелец подтверждает актуальный ключ/бюджет и запуск actual paid smoke.
До реальных данных нужны retention/auth/export policy и согласование доступа; synthetic
local development этими внешними решениями не блокируется.

Неизвестны официальная матрица жюри, срок сдачи v4, имена исполнителей и production SLA.
В delivery используются роли и этапы, не вымышленные сроки/обещание роста оценки.
При конфликте требований исполнитель оформляет вопрос/предложение в своём handoff,
не меняет архитектуру/статистику/ACL единолично.
