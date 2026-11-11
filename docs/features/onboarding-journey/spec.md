# Engineering Readiness Journey — specification

Версия 2.0 · P0 · статус: спроектировано, не реализовано.
Владельцы: Backend + Frontend. Backlog: RP-JOURNEY-01, RP-FE-01.

## Проблема и сценарий

Обычный список задач не объясняет зависимости, ближайший допустимый шаг и подтверждённость результата.

Предусловия: Пользователь имеет право на db-team-a-test; утверждён template db-access-team-a фиксированной версии.

Intern выбирает разрешённую цель → Go создаёт goal по immutable версии → показывает select_resource/check_access/check_connection → выводит blocker и допустимый recovery → progress меняется только от evidence.

## Бизнес-правила и данные

В P0 один JSON DAG; обязательные стадии заявки встроены в recovery check_access. LLM не меняет граф/permissions/methods. Нет ручного done/PATCH state. Различать право запросить доступ и наличие grant.

Данные: JourneyTemplate, Dependency, Goal, StepProgress, instruction_reference/version, evidence/blocker refs; статический template без runtime status.

## API, состояния и ошибки

GET /api/v2/journeys; POST/GET /goals; GET /goals/{id}/steps/{step_id} и /actions.

unverified/ready/blocked/waiting_external/verified вычисляет Go; Goal агрегирует шаги; immutable template version и optimistic progress version.

Ошибки: TEMPLATE_INVALID при цикле/unknown method/ref; 404 для чужой цели; 409 stale version; недоступный prerequisite не становится ready.

## Безопасность

Обязательны [security](../../architecture/security.md) и серверная авторизация каждого
объекта/действия; только synthetic данные. Go владеет бизнес-состоянием, Python только
предлагает. Закрытые документы/metadata не попадают в LLM, логи, агрегаты и чужие snapshot.

## Критерии приёмки

- [ ] Шаблон валидирует IDs, dependencies, ACL refs и allowlists; цикл/висячая dependency запрещают запуск.
- [ ] UI показывает цель, dependencies, evidence, blocker и следующий шаг; общая навигация по текущему goal/step.
- [ ] После refresh/restart сохранённые steps/progress совпадают; пользователь/LLM не выставляют verified.
- [ ] Процент считается по verified обязательным шагам; пустой маршрут не завершается; отозванное evidence инвалидирует downstream.
- [ ] Релевантные component/integration проверки и coverage >80% выполнены; health/fixtures не считаются фичей.

## Зависимости и границы

RP-CONTRACT-01, RP-DATA-01, RP-AUTH-01, RP-MOCK-01.
[Design](design.md), [tasks](tasks.md), [backlog](../../team/backlog.md).
P1/P2 не добавлять к обязательной реализации без решения TL; общий scope в [Product Spec](../../product/specification.md).

## Ручная проверка после реализации

После реализации войти intern-a, начать db-access-team-a, увидеть отсутствие grant, открыть check_connection с причиной недоступности. Refresh и restart Go не стирают цель.
