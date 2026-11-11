# Reverse Onboarding — specification

Версия 2.0 · P0 · статус: спроектировано, не реализовано.
Владельцы: Backend + AI + Frontend. Backlog: RP-REVERSE-01, RP-FE-03, RP-AI-DIAG-01.

## Проблема и сценарий

Одинаковая проблема у разных новичков остаётся в отдельных чатах и не становится сигналом для улучшения инструкции.

Предусловия: Есть scoped friction events одной группы и assigned documentation_owner; версии инструкции/маршрута сохранены.

Первый intern получает ошибку → второй distinct intern получает ту же → Go дедуплицирует/группирует → reserve unique candidate → AI safe hypothesis/fix → Go сохраняет → owner рассматривает.

## Бизнес-правила и данные

Group journey_id + step_id + error_code, distinct interns>=2. Повторная ошибка одного человека не порог. Один candidate на группу в P0, без ML/персональных данных/автопубликации. Повторение — гипотеза, не доказанный дефект.

Данные: FrictionEvent, CandidateContribution (внутренний distinct), KnowledgeGapCandidate, Review, resolved_reference.

## API, состояния и ошибки

GET /api/v2/friction-groups, /knowledge-gaps[/{id}]; POST /knowledge-gaps/{id}/review; internal /knowledge-gap-draft; создание candidate только Go pipeline.

proposed/under_review/accepted/rejected/resolved; accepted не меняет KB, resolved с человечески проверенной версией; enrichment pending/complete/failed отдельно.

Ошибки: Concurrent threshold/duplicate event не дублируют candidate; AI unavailable → safe deterministic card; wrong scope 404/403; stale review version 409.

## Безопасность

Обязательны [security](../../architecture/security.md) и серверная авторизация каждого
объекта/действия; только synthetic данные. Go владеет бизнес-состоянием, Python только
предлагает. Закрытые документы/metadata не попадают в LLM, логи, агрегаты и чужие snapshot.

## Критерии приёмки

- [ ] Ошибки двух разных intern одного journey/step/code дают один candidate; повторы одного — ноль до второго.
- [ ] Карточка показывает шаг, instruction/version, error, affected_count, hypothesis/fix; нет user IDs/names/raw logs/chats/PII.
- [ ] Неназначенный docs-owner и другая команда не читают агрегат; версии учитываются в refs, ACL-области не смешиваются.
- [ ] Owner принимает/отклоняет гипотезу, accepted не запускает publish/ingest; concurrent retry/AI fallback не создают дубль.
- [ ] Релевантные component/integration проверки и coverage >80% выполнены; health/fixtures не считаются фичей.

## Зависимости и границы

RP-BLOCKER-01, RP-AUTH-01, RP-AI-DIAG-01; synthetic intern-a/intern-b из RP-MOCK-01.
[Design](design.md), [tasks](tasks.md), [backlog](../../team/backlog.md).
P1/P2 не добавлять к обязательной реализации без решения TL; общий scope в [Product Spec](../../product/specification.md).

## Ручная проверка после реализации

После реализации intern-a повторяет DB_SSL_REQUIRED два раза — candidate нет. intern-b команды A получает тот же code — одна карточка с count=2. docs-owner-a принимает: документ остаётся прежней версии.
