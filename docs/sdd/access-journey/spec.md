# Доступ к БД и проверяемая готовность — спецификация

## Цель и предусловия

Аутентифицированный synthetic intern имеет разрешённый versioned journey и ресурс db-team-a-test. Отдельный approver назначен этому ресурсу.

## Пользовательский сценарий

Intern выбирает цель → проверяет доступ → получает draft заявки → просматривает и подтверждает отправку → approver принимает решение → Go повторно проверяет IAM → intern проверяет SSL-подключение → trusted evidence подтверждает шаги.

## Правила и критерии приёмки

- **ACC-01.** Шаги, зависимости, разрешённые checks и роли задаёт immutable JSON template. LLM не создаёт обязательные этапы.
- **ACC-02.** Отправка заявки требует неизменяемого preview, TTL и explicit confirm стажёра. Одобрение выполняет другая scoped роль; интервал ожидания сам по себе не выдаёт grant.
- **ACC-03.** Approved без observed IAM grant не является verified. Доступ подтверждает свежая correlated IAM-проверка, подключение — allowlisted DB check.
- **ACC-04.** SSL disable даёт DB_SSL_REQUIRED/blocker; SSL require с grant даёт passed. Произвольный SQL, DSN и команды во входе запрещены.
- **ACC-05.** Role/team/resource/ownership/document ACL проверяются до чтения и записи, при replay и после отзыва доступа. Чужой ID даёт 403/404 без metadata.
- **ACC-06.** Повтор operation key не создаёт второй side effect. Изменённый snapshot, истёкший TTL и stale expected_version отклоняются.
- **ACC-07.** Ошибка/unavailable не превращается в успех; revoke инвалидирует зависимое evidence. Refresh/restart сохраняют подтверждённый прогресс.

## Контрольный пример

При submitted заявке прогресс не растёт. После scoped approval и IAM evidence первый шаг verified. Ошибка DB_SSL_REQUIRED оставляет цель незавершённой до новой успешной проверки.

[Дизайн](design.md) · [Реализация и проверки](tasks.md) · [Общий scope](../../requirements.md).
