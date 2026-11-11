# Causal Blockers & Friction Events — specification

Версия 2.0 · P0 · статус: спроектировано, не реализовано.
Владельцы: Backend + AI + Frontend. Backlog: RP-BLOCKER-01, RP-AI-01, RP-FE-02.

## Проблема и сценарий

Нельзя понять причину остановки или обнаружить повторяющуюся проблему без структурированных проверок и ошибок.

Предусловия: Есть check attempt и безопасный нормализованный результат; инструкция и версия связаны с step.

Failed check → Go нормализует code/type → сохраняет blocker + friction → AI объясняет гипотезу → UI показывает допустимый recovery/buddy → recheck подтверждает устранение.

## Бизнес-правила и данные

Error сохраняется с journey/version/step/attempt/outcome/instruction и intern_id для distinct-count. AI classification — гипотеза. Raw logs/chat/secrets не копируются. CHECK_UNAVAILABLE не доказывает пробел документации.

Данные: Blocker, FrictionEvent, VerificationCheck, allowed recovery_actions, safe_context; unique attempt/error.

## API, состояния и ошибки

GET /api/v2/goals/{id}/steps/{step_id} /actions; internal /classify-error; нет публичного trusted event ingest.

Blocker open/resolved; waiting_external при submitted/escalated, ответ buddy без recheck оставляет blocker открытым.

Ошибки: Unknown technical exception → safe code; invalid classification → deterministic explanation; повторное событие не дублирует friction.

## Безопасность

Обязательны [security](../../architecture/security.md) и серверная авторизация каждого
объекта/действия; только synthetic данные. Go владеет бизнес-состоянием, Python только
предлагает. Закрытые документы/metadata не попадают в LLM, логи, агрегаты и чужие snapshot.

## Критерии приёмки

- [ ] DB_SSL_REQUIRED привязан к нужным goal/step/instruction/version; есть safe next action.
- [ ] Неизвестная ошибка/таймаут не раскрывают payload, не становятся ложным verified/доказанным дефектом документа.
- [ ] Повтор одного attempt/event не дублирует запись; повторные попытки одного intern не увеличивают distinct-count.
- [ ] Resolved blocker требует evidence; история safe ошибок доступна только owner и в выбранном buddy snapshot.
- [ ] Релевантные component/integration проверки и coverage >80% выполнены; health/fixtures не считаются фичей.

## Зависимости и границы

RP-VERIFY-01; схемы из RP-CONTRACT-01.
[Design](design.md), [tasks](tasks.md), [backlog](../../team/backlog.md).
P1/P2 не добавлять к обязательной реализации без решения TL; общий scope в [Product Spec](../../product/specification.md).

## Ручная проверка после реализации

После реализации дважды доставить результат одного DB_SSL_REQUIRED: одна attempt-запись. Повторить check тем же intern — отдельная попытка, один уникальный участник группы.
