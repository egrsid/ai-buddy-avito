# Buddy Debug Bridge — specification

Версия 2.0 · P0 · статус: спроектировано, не реализовано.
Владельцы: Backend + AI + Frontend. Backlog: RP-BUDDY-01, RP-FE-03, RP-AI-DIAG-01.

## Проблема и сценарий

Buddy тратит время на выяснение цели, уже выполненных проверок и точной ошибки.

Предусловия: Intern имеет assigned buddy; blocker/check context разрешён обоим; snapshot подготовлен и проверен Go.

AI/Go собирает диагностическую карточку → intern видит точный получатель/данные → confirm → assigned buddy читает и отвечает/закрывает → решение связано с blocker → intern повторяет check.

## Бизнес-правила и данные

Snapshot: goal/step/blocker/checks/errors/actions/instructions/hypotheses с confidence/question. Без полного чата, токенов, DSN, чужих данных. Пересечение ACL до preview/confirm и при чтении. Ответ не verified, KB не меняется.

Данные: Action escalate_to_buddy, Escalation, diagnostic_snapshot, blocker_id, answer/resolved_at, version.

## API, состояния и ошибки

POST /api/v2/actions и /confirm; GET /escalations[/{id}]; POST /escalations/{id}/reply; internal /diagnostic-summary.

Escalation open/resolved; answer+resolved атомарны; исходный blocker остаётся open до успешного recheck.

Ошибки: Нет назначенного buddy/изменение назначения/ACL требует нового preview; чужой объект 404; stale version/повтор другого ответа 409.

## Безопасность

Обязательны [security](../../architecture/security.md) и серверная авторизация каждого
объекта/действия; только synthetic данные. Go владеет бизнес-состоянием, Python только
предлагает. Закрытые документы/metadata не попадают в LLM, логи, агрегаты и чужие snapshot.

## Критерии приёмки

- [ ] Snapshot содержит нужную диагностику и совпадает с preview; без confirm не отправляется.
- [ ] Buddy другой команды/неназначенный не читает и не отвечает; закрытый source/PII не попадают в snapshot.
- [ ] Same-key reply возвращает исходный ответ, другой ответ resolved запрещён; ответ сохраняется после restart.
- [ ] Answer+resolved не публикуют KB и не закрывают technical goal; повторный check необходим.
- [ ] Релевантные component/integration проверки и coverage >80% выполнены; health/fixtures не считаются фичей.

## Зависимости и границы

RP-AUTH-01, RP-BLOCKER-01, RP-CHAT-01, RP-AI-DIAG-01.
[Design](design.md), [tasks](tasks.md), [backlog](../../team/backlog.md).
P1/P2 не добавлять к обязательной реализации без решения TL; общий scope в [Product Spec](../../product/specification.md).

## Ручная проверка после реализации

После реализации intern-a отправляет SSL-карточку; buddy-b получает 404, buddy-a отвечает. Escalation resolved, blocker не technical resolved до passed DB check.
