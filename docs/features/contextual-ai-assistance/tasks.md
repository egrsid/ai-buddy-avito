# Contextual AI Assistance — tasks

13 ноября: компоненты сведены в TL, настоящий AI/Go/corporate/DB API путь прошёл;
полные browser/clean image/consumer gates открыты. Текущие source SHA, component checks
и конкретные оставшиеся задачи — [TL record](../../team/tl-readiness.md).
Ниже исходные задачи; их checkbox не заменяет результат указанного integration review.


Все продуктовые задачи не завершены; владельцы, P0/день, зависимости и разрешённые
директории централизованы в [backlog](../../team/backlog.md). Исполнители/reviewers
назначены по ролям в [handoff](../../team/assignments/README.md); имена не выдумывать. [Spec](spec.md), [design](design.md).

12 ноября: RP-AI-CORE-01 / RP-AI-DIAG-01 IN_PROGRESS. В 3f955322 есть HTTP/SSE,
offline retrieval/provider и structured операции; 184 tests/99.90%, 29/29 evals.
[AI-R1–R4](../../team/ai-review-2026-11-12.md) — следующий остаток AI; Go/FE acceptance
по-прежнему открыт. Не отмечать все пункты ниже выполненными по component tests.

12 ноября, вечер (AI Engineer, ветка feature/ai-mvp-v2): AI-R1–R4 исправлены. RP-AI-02 без ключа
готов: адаптер `openai` (Cloud.ru), журнал расходов с reserve/settle, профиль эмбеддингов и
reindex, LLM-wiring в compose/.env.example/README, фильтр инъекций в контексте, live evals
(`python -m app.live_evals`) и smoke (`python -m app.smoke`). Live evals на локальной
qwen3.5:9b: все safety-кейсы проходят, первый токен p95 < 20 с (отчёт
`ai-service/evals/report-live.md`). Ждёт ключа Cloud.ru: smoke, live evals на GigaChat, сверка
с биллингом. Go/FE acceptance по-прежнему открыт.

Предусловия интеграции: RP-CONTRACT-01, RP-AUTH-01, RP-JOURNEY-01. AI CORE делается
по contract fixtures после RP-DATA-AI-01; Go chat зависит только от CORE. Live — RP-AI-02.

| ID backlog | Работа в рамках фичи | Наблюдаемый результат / done |
|---|---|---|
| RP-AI-CORE-01 | Offline generate/retrieval/route/access draft | Ранний Go chat/access можно интегрировать; ACL/schema safety проходит |
| RP-AI-DIAG-01 | Classification/handoff/candidate draft, полный набор >=20 evals | Fallback закрывает диагностику, all safety pass |
| RP-CHAT-01 | Go history/run/SSE и validation | Disconnect/cancel/retry/invalid output корректны и persistent |
| RP-FE-02 | Контекстный чат и action previews | Ожидание/partial/error/source drawer работают через Go |
| RP-AI-02 | AI Engineer: вся LLM-specific интеграция/оплата без approval TL; ai-sage/GigaChat3.5-432B-A28B, BAAI/bge-m3, бюджет 1000/stop 800 ₽ | Persistent reserve/usage guard, hard cap, 5–10 замеров/20s first content, optional safe QA cache, profile/reindex tests и отдельный live report по [strategy](../../AI_ENGINEERING_STRATEGY.md); не блокирует offline P0 |

- [ ] Подтвердить общие target DTO/events и границы до реализации; не использовать legacy v1 как новый контракт.
- [ ] Реализовать согласованные happy/error/security состояния в назначенных директориях.
- [ ] Выполнить приёмку spec, make check и релевантные component checks; coverage строго >80% с первой бизнес-фичи.
- [ ] На integration checkpoint проверить путь в Compose, refresh/restart и отрицательные доступы.
- [ ] Обновить backlog и SDD по фактическому результату, записать команды/ограничения; публикация только владельцем.
