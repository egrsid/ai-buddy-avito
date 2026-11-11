# Назначение: AI Engineer

Планируемая ветка **feature/ai-mvp-v2 ещё не создана**; владелец готовит её от актуальной
foundation. Роль назначена, handle не придуман. [Ветки](../branches.md), [backlog](../backlog.md).

## Начать с RP-CONTRACT-AI-01

AGENTS/Before starting, [TL baseline](../../architecture/contract-baseline.md),
[API](../../architecture/api-contracts.md), [security](../../architecture/security.md),
[AI design](../../architecture/ai-design.md), [contract handoff](../contract-handoff.md).

Сделать contracts/v2/ai.schema.json, AI positive/negative fixtures и свой contract test.
Описать generate input/output/SSE, journey selection/clarification, access draft/missing fields,
classify-error, diagnostic-summary, knowledge-gap-draft, scoped knowledge/search.
Common AccessScope/Source/IDs/States — из BE common schema, не дублировать свой набор.
Не ждать реализации Go: shared fields уже заданы TL, общие refinements согласуются с BE.

AI Engineer сам выбирает prompting/provider adapter/retrieval/module layout внутри
контрактов; TL не диктует framework. Reviewer Backend сверяет producer/consumer совместимость,
TL — security границы. До общего contract gate runtime DTO не закрепляются автономно.

## Очередь реализации

| ID | Вход | Результат |
|---|---|---|
| RP-DATA-AI-01 | Contract gate | Kb ACL migrations, synthetic team/restricted/PII knowledge fixtures, версии/IDs с Backend; физическая schema kb сохраняется |
| RP-AI-CORE-01 | Contract gate + DATA-AI | Offline generate и scoped retrieval, route selection, access-request draft и SSE/schema validation; Backend может интегрировать доступ |
| RP-AI-DIAG-01 | AI CORE | Error classification, safe buddy summary, candidate hypothesis/fix, invalid/unavailable fixtures; весь набор >=20 evals |
| RP-AI-02 | P1, provider/key/budget + RP-AI-01 | Live/embeddings adapter и отдельный quality/latency/cost report |

RP-AI-01 — milestone CORE+DIAG, не блокировать ранний chat/access до всего diagnostic
пакета. DIAG работает по согласованным fixtures, не ждёт готового Go blocker/candidate
endpoint; реальную интеграцию потом проверяют оба владельца. Это снимает цикл ожидания.

## Владение и приёмка

ai-service/, ai-service/migrations/, data/knowledge/, AI schema/examples/invalid/tests.
App/corporate/users/grants/seed и business state принадлежат Backend/Go; общие scripts — TL.
Python не выставляет verified, не меняет route/permissions, не вызывает corporate mutations.
Модель видит только разрешённые fragments/titles/metadata: provider-input spy и revoked ACL
негативные проверки обязательны. Hypothesis/confidence не evidence; handoff без сырого чата/
секретов; candidate input — safe aggregate без IDs людей. Все structured outputs валидируются.

make check, AI component checks/coverage >80%, >=20 evals и all safety pass; offline path
не вызывает сеть/не требует key. Lexical mock не выдаётся за live pgvector. Report model/mode/
dataset/quality/cost отдельно от coverage. Backend получает fixtures/совместимые DTO,
TL — команды, результат, ограничения. Никакого внешнего LLM key в Git/logs/fixtures.
