# Цели с раскрываемыми подзадачами — design v3

Target proposal, не executable schema/runtime. [Spec](spec.md).

React хранит только Set раскрытых goal_id; состояние и проценты принадлежат Go.
Goal summary DTO: id/title/status/version/progress{verified,total,percent}/updated_at.
Если list API уже возвращает полный Goal со steps, использовать его без второго запроса;
если нужен summary pagination — BE и FE согласуют отдельную загрузку steps на раскрытие.
Не смешивать два источника истины. Страницы списка стабильны по order+cursor; новые/удалённые
цели не дублируются, исчезнувшие IDs удаляются из UI Set. Максимум 20 summaries на страницу
как начальный bounded baseline; изменение лимита через contract review. Проверять ACL и
ownership при list/detail, не выдавать count/названия чужих целей.

Goal title и progress обязательны в списке, Step/Brief section не подменяют друг друга.
FE не считает проценты самостоятельно по неполному/отфильтрованному массиву. Stale/version
conflict — обновить goal, pending guard проверок сохранить. Предлагаемые list/detail DTO и
pagination fixtures включаются в V3-CONTRACT-BE/FE; executable schemas ещё не изменены.

[Общие границы](../../v3/architecture.md), [задачи/owners](../../v3/delivery.md).
