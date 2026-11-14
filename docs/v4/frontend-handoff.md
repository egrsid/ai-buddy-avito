> **Актуальная локальная приёмка и live-стенд:** [final acceptance](final-acceptance-2026-11-14.md).
> Нижние статусы отсутствия runtime/контрактов/когорт относятся к предыдущему этапу.

> **Продолжение поставки:** [локальная BE/AI/FE интеграция](integration-review-2026-11-14.md).
> Новые Go API уже подключены через strict consumer contracts/v4.ts. Требования,
> которые ещё не поставлены, перечислены в актуальном отчёте; текст ниже исторический.

# FE v4 · поставка интерфейса до контрактного gate

Ветка feature/frontend-v4, база docs/v4-planning 9a0d95f. Владелец поручил FE+TL runtime
и поднял coverage до 82%. BE/AI ветки v4 и contracts/v4 на момент fetch отсутствуют.

Реализованы presentation components workspace/timeline/revision/impact с независимыми
состояниями, focus/collapse, pending guard, expiry recheck, exact selected changes,
privacy-aware rendering и explicit offline/unknown origin. `/v4-preview` — только
помеченные synthetic samples, без API-v4 вызовов/записи в app. В обычных разделах остаётся v3.

`frontend/src/v4/models.ts` — FE presentation models, НЕ финальные публичные schemas.
Они не закрепляют DTO до G1. Прямое подключение этих shapes к Go запрещено без consumer
review. Нет выдуманных claims о server ACL, persistence, as_of cohorts или human publication.

## Требования к поставке BE/AI для подключения

- Accepted schemas public/internal/events и positive/negative fixtures с exact names.
- Workspace page/cursor/scope и link-preview/confirm, pin/revoke/expected_revision.
- Timeline current reducer state, trusted type, invalidated/received_at/as_of и no-history.
- Proposal status/origin/base hash/draft revision/generation revision/TTL, allowlisted paths,
  selected apply/idempotency replay/conflict и questions; no raw model arbitrary patch.
- Impact cohort/config/policy revisions, suppression всех производных, server rate/delta,
  eligible/exclusions/window semantics. FE не вычисляет aggregate по сырым событиям.
- Positive/negative error/replay samples и working endpoints. Чужой object одинаковый 404.

До них V4-CONTRACT-FE-01 BLOCKED на consumer acceptance; WORK/PROOF/EDIT/IMPACT-FE
имеют готовый prototype/component layer, production wiring и real API E2E OPEN.
V4-E2E-FE-01: preview browser test поставлен отдельно от full-stack acceptance.
Наличие frontend green suite не закрывает G1/G3/G4.

Проверки: frontend build PASS; 609 component tests PASS, all-code lines >95%, новые
presentation components v4 100% lines (statement/branch coverage также измеряются).
Точный итог после TL-проверки: [FE/TL checkpoint](fe-tl-checkpoint.md).
