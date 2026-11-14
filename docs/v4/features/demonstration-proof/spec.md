# Проверяемое AI-демо — specification v4

PLANNED; runtime отсутствует. [Product](../../product.md), [delivery](../../delivery.md).
Задачи: V4-DEMO-TL-01, V4-LIVE-AI-01, V4-E2E-FE-01.

Пять–семь минут показывают пользу для стажёра, human-reviewed исправление и измерение
наблюдений следующих групп. Отдельный короткий блок показывает полезный primary AI ответ,
ACL negative и управляемый отказ. Никаких скрытых fixture подмен бизнес API.

Offline rehearsal обязателен. Current owner choice offline сохраняется; actual paid smoke
только после явного решения владельца о live запуске и проверенном бюджете.
Без этого demo помечается offline, actual-live gate OPEN, нельзя объявлять весь v4 release accepted.

Operator harness local/test создаёт отдельный project/ports/DB, не кнопку очистки
пользовательской БД. Synthetic pre-history явно помечена. Презентация не обещает
измеренной экономии времени, доступа в настоящую корпоративную сеть или production SLA.

Приёмка: V4-T20–T24 в [матрице](../../testing.md).
[Design](design.md), [tasks](tasks.md).
