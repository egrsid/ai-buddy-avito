# Journey Template — target v2

Версия 2.0 · проектный контракт. Реальный JSON-файл и валидатор добавляет RP-JOURNEY-01
после RP-CONTRACT-01; код/seed сейчас не изменены.

Template: journey_id (стабильный ключ), version (positive int), title, description,
team_id, resource_id, target_roles, approved_by, content_hash, steps[].
Один P0 journey `db-access-team-a` закреплён за командой A и db-team-a-test.
Каждый Step: id, title, description, dependencies[], required_permissions[],
instruction_reference {document_id,version}, available_actions[], verification_method.
Dependency: {step_id, condition:"verified"}. Method — enum серверного allowlist.
`status` входит в runtime Step DTO, не в статический template; начальное значение
вычисляет Go как unverified/ready. Это разделение исключает двойное владение состоянием.

| Step id | Зависит от | Проверка | Восстановление/действие |
|---|---|---|---|
| select_resource | — | resource_policy_match | Выбрать только разрешённый ресурс |
| check_access | select_resource | iam_permission_present | При отсутствии grant — блокер и подготовка заявки |
| check_connection | check_access | mock_db_connection | При DB_SSL_REQUIRED — безопасная настройка и/или buddy, повтор check |

Подготовка черновика → preview → confirm → submit → approval → grant recheck —
контролируемый recovery workflow шага check_access. Это не обязательные шаги для
пользователя, у которого уже есть grant; никто не обязан создавать ненужную заявку.
Девять стадий из brief представлены целиком этим workflow и обязательными проверками.
Все три обязательных шага verified означают завершение Goal.

required_permissions — права на допустимое выполнение/проверку шага, например
`access.request`/`db.check`; проверяемое наличие DB grant — отдельное условие метода
`iam_permission_present`. Отсутствие grant не должно запрещать законную заявку на него.
Отсутствие права на сам ресурс запрещает выбор маршрута, названия скрываются.

Go перед публикацией проверяет уникальные IDs, отсутствие циклов/висячих dependencies,
непустой обязательный набор, доступность instruction refs/version/ACL, allowlists actions,
methods, roles, resource и approved_by. Ошибка → TEMPLATE_INVALID, запуск невозможен.
LLM может выбрать только journey_id/version из разрешённого списка и заполнить допустимые
переменные; игнорирование dependency, смена permission/method/шагов отклоняются.

Goal фиксирует version/hash. Новая версия не переписывает активную цель; миграция
пользовательского маршрута — отдельное TL-решение. Обновление инструкции публикуется
человеком, новая цель берёт утверждённую версию. В P0 только одна активная версия;
отсутствие SSL в synthetic instruction — заранее заданный дефект для демонстрации,
а не обещание автоматически выявлять любую ошибку документации.
