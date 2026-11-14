# Доказательства состояния — specification v4

PLANNED; runtime отсутствует. [Product](../../product.md), [delivery](../../delivery.md).
Задачи: V4-PROOF-BE-01, V4-PROOF-FE-01.

Intern открывает «Почему такой статус?» и видит текущий Go state и последовательность
фактов: submitted → approved → IAM observed → SSL failed → retry passed.
Человек различает факт заявки, scoped approval и technical evidence.
При revoke старое evidence помечается invalidated; текущий статус важнее прежнего успеха.

P0 использует существующий DB workflow. Ответ LLM, claim и Telegram click не оформляются
как trusted event. Причина blocker на safe code/approved dependency; неопределённость честная.
Нет заявлений об установленной причине на основании одной гипотезы AI.

Mentor не получает индивидуальную timeline только по team/buddy. Передача фактов идёт
через прежний ACL-intersection preview, а не новый полный audit export.

Приёмка: V4-T05–T07 в [матрице](../../testing.md).
[Design](design.md), [tasks](tasks.md).
