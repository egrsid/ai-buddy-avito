# Contextual AI Assistance — tasks

Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Исполнители/reviewers
назначены по ролям в [handoff](../../team/assignments/README.md); имена не выдумывать. [Spec](spec.md), [design](design.md).

12 ноября: RP-AI-CORE-01 / RP-AI-DIAG-01 IN_PROGRESS. В 3f955322 есть HTTP/SSE,
offline retrieval/provider и structured операции; 184 tests/99.90%, 29/29 evals.
[AI-R1–R4](../../team/ai-review-2026-11-12.md) — следующий остаток AI; Go/FE acceptance
по-прежнему открыт. Не отмечать все пункты ниже выполненными по component tests.

Предусловия интеграции: RP-CONTRACT-01, RP-AUTH-01, RP-JOURNEY-01. AI CORE делается
по contract fixtures после RP-DATA-AI-01; Go chat зависит только от CORE. Live — RP-AI-02.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-AI-CORE-01 | Offline generate/retrieval/route/access draft | Ранний Go chat/access можно интегрировать; ACL/schema safety проходит |
| RP-AI-DIAG-01 | Classification/handoff/candidate draft, полный набор >=20 evals | Fallback закрывает диагностику, all safety pass |
| RP-CHAT-01 | Go history/run/SSE и validation | Disconnect/cancel/retry/invalid output корректны и persistent |
| RP-FE-02 | Контекстный чат и action previews | Ожидание/partial/error/source drawer работают через Go |
| RP-AI-02 | Live provider/embeddings spike | Отдельный отчёт качества/cost, не блокирует offline P0 |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.

## Локальный Backend результат · 2026-11-12

Persistent conversations/runs, SSE schema/correlation, cancel/retry/partial, sources/tools после validation+commit; AI boundary проверена contract harness.
Реализация и component/API проверки находятся в Backend working tree;
[команды, покрытие и ограничения](../../team/tl-readiness.md). Задачи Backend IN_PROGRESS,
не DONE: final consumer acceptance, настоящая AI-интеграция и FE browser A/B/C еще нужны.
Knowledge/provider реализацию и UI этой поставкой не заменяли.
