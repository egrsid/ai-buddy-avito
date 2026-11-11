# Proof of Readiness — specification

Версия 2.0 · P0 · статус: спроектировано, не реализовано.
Владельцы: Backend + Fullstack/QA + Frontend. Backlog: RP-VERIFY-01, RP-MOCK-03, RP-FE-02.

## Проблема и сценарий

Нажатие «Готово», ответ AI и approval не доказывают, что стажёр действительно может подключиться.

Предусловия: Разрешённый Goal/Step и verification_method, подтверждённые prerequisites, IAM recheck перед DB check.

Intern явно запускает safe check → Go policy/version check → allowlisted mock method → correlated result → atomic evidence/step/progress → UI показывает источник и время.

## Бизнес-правила и данные

Только trusted adapter/system events. Никакого SQL/DSN/произвольного host. User claim/manual attest отдельно от technical evidence; P0 verified только от synthetic trusted check. Duplicate/out-of-order events не портят состояние.

Данные: VerificationCheck, Evidence, StepProgress/Goal version, BusinessEvent, safe options ssl_mode.

## API, состояния и ошибки

POST /api/v2/goals/{id}/steps/{step_id}/checks; GET /checks/{id}; internal /iam/access-checks, /db/connection-checks.

Check queued/running/passed/failed/unavailable; Step verified только по successful method + dependencies; revoked evidence снимает downstream verified.

Ошибки: ACCESS_DENIED, DB_SSL_REQUIRED, CHECK_UNAVAILABLE, version conflict, bad provenance/correlation; инфраструктурный сбой не заменяет результат на успех.

## Безопасность

Обязательны [security](../../architecture/security.md) и серверная авторизация каждого
объекта/действия; только synthetic данные. Go владеет бизнес-состоянием, Python только
предлагает. Закрытые документы/metadata не попадают в LLM, логи, агрегаты и чужие snapshot.

## Критерии приёмки

- [ ] При ssl_mode=disable synthetic incomplete instruction даёт DB_SSL_REQUIRED; require после grant даёт passed.
- [ ] Без grant/permission, с чужим subject/check/goal/version или fake source verified невозможен.
- [ ] Replay check/event не создаёт новые evidence/friction; поздний результат не перезаписывает новый.
- [ ] Успех показывает synthetic source/time; refresh/restart сохраняют результат; IAM revoke снимает verified.
- [ ] Релевантные component/integration проверки и coverage >80% выполнены; health/fixtures не считаются фичей.

## Зависимости и границы

RP-JOURNEY-01, RP-ACCESS-01, RP-MOCK-02.
[Design](design.md), [tasks](tasks.md), [backlog](../../team/backlog.md).
P1/P2 не добавлять к обязательной реализации без решения TL; общий scope в [Product Spec](../../product/specification.md).

## Ручная проверка после реализации

После реализации approved без grant не запускает connection. С grant, ssl_mode=disable возвращает error и blocked. После require check passed даёт verified; фраза «готово» этого не делает.
