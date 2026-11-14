> **Актуальная локальная приёмка и live-стенд:** [final acceptance](final-acceptance-2026-11-14.md).
> Нижние статусы отсутствия runtime/контрактов/когорт относятся к предыдущему этапу.

> **Обновление локальной интеграции 14 ноября:** BE/AI v4 уже поставлены и подключены
> к FE. [Текущий статус, доказательства и оставшиеся gates](integration-review-2026-11-14.md).
> Ниже сохранён первоначальный план/исторический checkpoint; заявления об отсутствии
> runtime относятся к предыдущему этапу. Полная release-приёмка ещё не закрыта.

**FE/TL checkpoint 14 ноября:** [фактическая поставка и блокеры](fe-tl-checkpoint.md).
FE prototypes/component tests и TL 82% gates готовы; G1/full runtime integration
BLOCKED на отсутствующих BE/AI v4 schemas/endpoints. Нижние TODO — первоначальный план.

# V4 — задачи, зависимости и handoff

Только V4-DOC-01 выполняется текущим поручением. Все runtime задачи ниже **TODO**,
CONTRACT proposals READY к старту после чтения пакета; approval ещё не получен.
[Product](product.md), [architecture](architecture.md), [acceptance](testing.md).
Новых feature branches этим пакетом не создаётся.

## Общая база

Base f4f63a0 из feature/local-v3-integration, а не main/v2 или расходящиеся v2 branches.
Docs ветка docs/v4-planning содержит только Markdown поверх базы. Перед реализацией
владелец распространяет принятый planning snapshot без reset чужой работы.
Предлагаемые, пока не созданные ветки: feature/backend-v4, feature/ai-v4,
feature/frontend-v4, feature/qa-v4, feature/tl-v4. No push/PR от агентов.

## Gates

- G0: TL сверяет этот design и открытые решения с владельцем; нет выдуманного approval.
- G1: BE+AI executable schemas, common refs, positive/negative fixtures, FE typed consumer
  tests; TL фиксирует hashes, совместимость, review и lock. Runtime DTO после G1.
- G2: additive migrations/seed replay, attribution/exposure ownership, ACL и idempotency tests.
- G3: workspace/timeline/editor/comparison в реальном offline flow, component coverage >80%.
- G4-offline: чистый isolated demo, browser/mobile/negative/restart, все safety evals,
  v3 DB/docs/Telegram regressions. Это local demo readiness, не actual-live acceptance.
- G4-live: отдельное разрешение и бюджет владельца → actual primary smoke/usage evidence.
  Без него статус OPEN; разработка остальных функций продолжается.
- G5: сводный release review, явно принятые ограничения, воспроизводимость запуска,
  исходные критерии организаторов сверены владельцем. Публикация — владелец.

## Backlog

| ID | Owner / reviewer | Depends on | Каталоги при реализации | Definition of Done |
|---|---|---|---|---|
| V4-DOC-01 | TL / владелец | v3 audit | docs/, Markdown instructions | Пять SDD, общая модель/очередь/приёмка; links и docs-only checks |
| V4-CONTRACT-BE-01 | BE / FE, AI, TL | DOC-01 | contracts/v4 public/common/events proposals, backend tests | Workspace/link/timeline/proposal/apply/exposure/impact DTO, errors, fixtures и migrations plan |
| V4-CONTRACT-AI-01 | AI / BE, TL | DOC-01 | contracts/v4 internal AI, AI tests | RevisionDraft request/output, refs/needs_input/origin/bounds, positive/negative cases |
| V4-CONTRACT-FE-01 | FE / BE, AI, TL | CONTRACT-BE-01, CONTRACT-AI-01 | frontend/src/contracts/ | Strict parsing всех примеров/null/stale/suppressed/unknown states, письменный consumer review |
| V4-CONTRACT-01 | TL / все consumers | CONTRACT-FE-01 | docs/, общий lock tooling | G1: принятые refs/hashes/API semantics и совместимость v3 |
| V4-DATA-BE-01 | BE / TL, AI | CONTRACT-01 | backend/migrations/, data/seed/, backend tests | G2: links/proposals/exposure episodes, server attribution; no fake history; seed replay |
| V4-WORK-BE-01 | BE / FE, TL | DATA-BE-01 | backend/ | Own workspace projection, link preview/confirm, no repeat verified journey, ACL before labels |
| V4-WORK-FE-01 | FE / BE, QA | WORK-BE-01 | frontend/ кроме legacy QA files | Все карточки, две оси статуса, pending/direct URLs/mobile/focus; V4-T01–T04 |
| V4-PROOF-BE-01 | BE / FE, TL | CONTRACT-01 | backend/ | Correlated timeline, pagination/invalidations/current state/ACL; existing events, no writes on GET |
| V4-PROOF-FE-01 | FE / BE, QA | PROOF-BE-01 | frontend/ | Объяснение статуса/source/time/validity/next action; V4-T05–T07 |
| V4-EDIT-AI-01 | AI / BE, TL | CONTRACT-01 | ai-service/, evals/ | Bounded diff/questions, safety guards/fallback/origin, ≥24 evals/≥10 safety, human usefulness review |
| V4-EDIT-BE-01 | BE / AI, FE, TL | DATA-BE-01, EDIT-AI-01 | backend/ | Async proposal reservation, CAS/TTL/replay/revoke, atomic apply-to-draft, separate publish |
| V4-EDIT-FE-01 | FE / BE, AI, QA | EDIT-BE-01 | frontend/ | Before/after diff, questions, selected apply, stale/manual fallback; V4-T08–T13 |
| V4-IMPACT-BE-01 | BE / QA, TL | DATA-BE-01 | backend/ | Version cohorts/eligibility/privacy/oracle, as_of/policy revision, no identity exports |
| V4-IMPACT-FE-01 | FE / BE, QA | IMPACT-BE-01 | frontend/ | Counts/rates/pp/limits/no-data, synthetic label; V4-T14–T19 |
| V4-QA-01 | QA / BE, FE, TL | DOC-01 (план); CONTRACT-01 (API tests) | docs/testing/, frontend/e2e/v4-api-*.spec.ts | Exact metric oracle, API ACL/replay/concurrency/version negatives и результат; не чужое coverage |
| V4-DEMO-TL-01 | TL / BE, AI, FE, QA | DATA-BE-01 | scripts/, Compose/CI/docs | Isolated projects/ports/test clock/manifest, budget persistence; no runtime fault API exposure |
| V4-LIVE-AI-01 | AI / TL, BE, QA | EDIT-AI-01, DEMO-TL-01, явное live решение владельца | AI; LLM wiring по working agreements | 10 primary smoke, source/origin/usage/latency; faults separate, ledger/deadlines intact |
| V4-E2E-FE-01 | FE / QA, TL | WORK-FE-01, PROOF-FE-01, EDIT-FE-01, IMPACT-FE-01, DEMO-TL-01 | frontend/e2e/v4-browser-*.spec.ts | Full synthetic browser cycle + v3 regressions, mobile/keyboard/reload screenshots |
| V4-INTEGRATION-01 | TL / все owners | QA-01, E2E-FE-01; LIVE-AI-01 для live gate | tooling/infra/docs, импорт поставок | G4/G5: actual reports, tests/coverage/restart/CI evidence, OPEN явно отмечен |

DEPENDENCIES в таблице — DAG. CONTRACT-FE не ждёт runtime. PROOF-BE можно делать до DATA,
так как читает существующие trusted events. IMPACT-BE не ждёт AI editor — данные доступны
после DATA; full E2E ждёт обе ветви. AI framework/внутренние решения остаются у AI owner.

## Передача каждому участнику

**Backend:** начать CONTRACT-BE. Предъявить examples и negative semantics, затем DATA.
Не добавлять второй reducer; не считать текущий assignment row историей exposure.
Передать FE working endpoints и expected 401/403/404/409/422, AI — safe aggregate DTO.

**AI Engineer:** начать CONTRACT-AI и eval cases на synthetic fixtures. Ручной walkthrough
24 outputs, включая clear text/no-op и missing requirements. Затем EDIT-AI на accepted DTO.
Сохранять budget ledger; к live не переходить только из-за появления задач в плане.

**Frontend:** сначала CONTRACT-FE и макет по существующему reference. Fixture UI явно
помечен; live связывать только с Go. Начать workspace/timeline, затем editor/comparison.
При API несоответствии предъявить consumer case, не исправлять цифры вычислением в браузере.

**QA:** новое ограниченное назначение V4-QA-01 расширяет старые legacy RP smoke только
на v4 API negatives и metric oracle. Не менять onboarding.spec.ts/старые QA tests за
автора; новые файлы v4-api-*. Browser UX/E2E остаются у FE, coverage — у component owners.

**TL:** G0/contract lock, scope/ownership review, isolated orchestration, интеграция,
manifest и реальный restart. Не выдавать schemas/fixtures за готовую функцию, не менять
внутренний AI design за AI Engineer. Общие tooling правки согласовать с владельцами.

## Порядок при ограниченном времени

Сначала workspace + timeline: ясный сценарий и видимая инженерная ценность.
Далее AI diff → human publish; затем comparison на достоверных synthetic episodes.
Live preparation параллельно, платный прогон только отдельным решением. Все пять идей
остаются scope v4: если компонент не готов, честно отметить partial release, не убирать
privacy/evidence/human review и не рисовать недостающую метрику. Календарные оценки команда
даёт после G1; число доступных участников и сроки владельцем не сообщены.

## Формат поставки

Commit/tree SHA, changed paths, migration/schema revisions, API samples, commands с exit
codes, exact coverage per component, eval output и limitations. Дополнить свой SDD/tasks,
а TL обновляет общий статус. Чужие refs/ветки не перезаписываются; data reset запрещён.
