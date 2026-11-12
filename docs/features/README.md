# Feature Specifications — target v2

Статус восьми фич: Backend runtime и component/API evidence поставлены локально;
сквозная AI/FE продуктовая приёмка не выполнена.
AI-часть частично реализована в 3f955322: [review и остаток](../team/ai-review-2026-11-12.md).
Каждая папка содержит spec.md (поведение/приёмка), design.md (данные/API/границы)
и tasks.md (задачи с зависимостями). Единственный план приоритетов/владельцев —
[backlog](../team/backlog.md), продукт — [Product Spec](../product/specification.md).

| Фича P0 | Назначение |
|---|---|
| [authorization-and-privacy](authorization-and-privacy/spec.md) | Роли, team/resource/document ACL, safe RAG и privacy |
| [onboarding-journey](onboarding-journey/spec.md) | Goal и утверждённый JSON-маршрут с dependencies |
| [contextual-ai-assistance](contextual-ai-assistance/spec.md) | AI в контексте goal/step, structured outputs, SSE, offline |
| [access-request](access-request/spec.md) | Draft, confirm отправки, отдельный approval, IAM recheck |
| [readiness-verification](readiness-verification/spec.md) | Safe checks, trusted evidence, verified progress |
| [blocker-detection](blocker-detection/spec.md) | Ошибки, причинные blockers, safe recovery, friction events |
| [buddy-escalation](buddy-escalation/spec.md) | Preview диагностического snapshot и ответ назначенного buddy |
| [reverse-onboarding](reverse-onboarding/spec.md) | Два уникальных стажёра, один candidate, human review |

Старые папки onboarding и chat оставлены только как указатели замены; их прежние
S1/S2 tasks/DTO не являются параллельными требованиями. S3/S4 обновлены в существующих
access-request/buddy-escalation. Наличие SDD/fixtures/healthchecks не означает DONE.
