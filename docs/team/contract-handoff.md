# RP-CONTRACT-01 — исполнители, файлы и зависимости

Статус parent: IN_PROGRESS. TL-проектирование завершено; схемы и проверки потребителей
предстоит сделать. [Решения TL](../architecture/contract-baseline.md), [API](../architecture/api-contracts.md),
[events](../architecture/event-contracts.md), [journey](../architecture/journey-template.md),
[security](../architecture/security.md) и [AI integration policy](../architecture/ai-integration-policy.md)
— исходная общая база. Последняя содержит принятые TL-ответы на вопросы AI Engineer;
новые wire rules должны быть включены в создаваемые schemas/tests.

## Разделение работы

| ID | Единственный ответственный | Статус | Зависимость | Результат |
|---|---|---|---|---|
| RP-CONTRACT-TL-01 | TL | DONE | RP-DOC-01 | Зафиксирован baseline, synthetic policy, границы, файлы/DoD и review route |
| RP-CONTRACT-BE-01 | Backend | READY | RP-CONTRACT-TL-01 | Common/public/journey/events/corporate JSON schemas, examples/invalid cases и offline validator |
| RP-CONTRACT-AI-01 | AI Engineer | READY | RP-CONTRACT-TL-01 | AI input/output/SSE/knowledge schemas и examples; общий common ref согласуется с Backend |
| RP-CONTRACT-FE-01 | Frontend | TODO | RP-CONTRACT-BE-01, RP-CONTRACT-AI-01 | Проверка употребимости public DTO/SSE/errors, typed fixture parsing и записанный review |
| RP-CONTRACT-REVIEW-01 | TL | TODO | RP-CONTRACT-BE-01, RP-CONTRACT-AI-01, RP-CONTRACT-FE-01 | Общий offline check и согласование BE↔AI boundaries, сняты conflicts, baseline записан |

AI и BE могут проектировать свои файлы параллельно по TL baseline. AI не ждёт готового Go;
Backend не придумывает prompting/AI implementation. Common definitions редактирует только
Backend, AI сообщает необходимые поля. Ни один reviewer не считается согласовавшим файл
по умолчанию; отсутствие замечаний без review не является acceptance.

## Целевые файлы (ещё не созданы)

| Файл / зона | Автор | Потребитель/reviewer |
|---|---|---|
| contracts/v2/common.schema.json | Backend | AI + Frontend; TL для ACL/types |
| contracts/v2/public.schema.json | Backend | Frontend + TL |
| contracts/v2/journey.schema.json | Backend | AI + Frontend |
| contracts/v2/events.schema.json | Backend | AI + TL |
| contracts/v2/corporate.schema.json | Backend | TL; mock и Go implements Backend |
| contracts/v2/ai.schema.json | AI Engineer | Backend + TL |
| contracts/v2/examples/common.json, public.json, journey.json, events.json, corporate.json | Backend | Соответствующие потребители |
| contracts/v2/examples/ai.json | AI Engineer | Backend |
| contracts/v2/invalid/backend.json; tests/test_contracts_v2_backend.py | Backend | TL |
| contracts/v2/invalid/ai.json; tests/test_contracts_v2_ai.py | AI Engineer | Backend |
| tests/contract_v2_support.py; scripts/check_repo.py (только v2 contract validation) | Backend | TL; общий helper один, не две копии |
| frontend/src/contracts/ + frontend contract tests/fixtures | Frontend | Backend; только DTO bindings, без новой бизнес-фичи |
| docs/team/contract-handoff.md — запись review/gate | TL; reviewer передаёт результат | Все потребители |

`$id`: https://ai-buddy.invalid/contracts/v2/<name>.schema.json; common включает IDs,
State enums, Error, Source и AccessScope. Ref разрешается локальным registry, не HTTP.
Public/AI используют одни common definitions, не копируют несовместимые status/source enums.
Example record: {schema_uri,definition,payload}; invalid record дополнительно case_id,
expected_error_keyword. Эти вспомогательные файлы не public API. Окончательные конкретные
определения и nullability фиксируют BE/AI авторы при сохранении baseline и consumer review.

Владение `scripts/check_repo.py` на RP-CONTRACT-BE-01 — точечное исключение из общей зоны
TL. Согласовать момент правки с TL, не трогать Compose/DB runner/Makefile. Новые Python
dependencies не добавлять без необходимости: jsonschema/pytest уже присутствуют.
Все SQL/runtime/seed изменения относятся к RP-DATA/RP-MOCK, не к контрактной задаче.

## Чек-лист результата

- [x] TL baseline и роли/границы/версии зафиксированы по поручению владельца.
- [ ] Backend: все public/corporate/template/event cases + common schema, локальный registry;
  Error содержит INVALID_REQUEST_ID, HTTP fixtures соответствуют порядку token/header/JSON/schema.
- [ ] AI: все generate/structured/knowledge schemas, positive/negative payloads,
  tool.proposed/generation.completed и internal Error; Source.url строго /api/v2/knowledge/{id}.
- [ ] BE↔AI: scopes/refs/tool.proposed/generation.completed и safe draft проверены обеими сторонами;
  mock-header/timeout/heartbeat/terminal race fixtures и canonical Source.url не расходятся.
- [ ] Frontend: nullable/optional, все состояния, SSE/errors, fixture type parsing проверены.
- [ ] make check валидирует v1 и v2 отдельно; invalid cases не проходят; сеть/ключи не нужны.
- [ ] TL: результат review, проверенные revision/file hashes, команды и ограничения записаны.
- [ ] Владелец включил принятый baseline в назначенные рабочие ветки; потребители видят одну версию.

RP-CONTRACT-01 DONE после всех технических пунктов, включая записанный финальный TL review; публикация/доставка
базы — отдельный организационный gate владельца перед общей реализацией. В текущем
поручении нет ни внешнего review, ни новых schemas, ни утверждения, что v2 проверки прошли.

## Кто начинает сейчас

Backend получает RP-CONTRACT-BE-01, AI Engineer — RP-CONTRACT-AI-01. Frontend может
прочитать baseline, отметить замечания, подготовить структуру UI; consumer check завершается
после получения schemas/examples. Fullstack не назначается помощником по schemas или всем
тестам: у него один ограниченный RP-QA-01. TL оставляет parent открытым до результатов команды.
