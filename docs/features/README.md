# Feature Specifications — target v2

## Текущий план новой разработки — v3

V2 ниже — baseline работающего main, не очередь новых задач. Новый план:
[Product/архитектура/backlog/приёмка](../v3/README.md).

| Фича v3 | SDD |
|---|---|
| Telegram-контакт | [spec](telegram-mentor-contact/spec.md), [design](telegram-mentor-contact/design.md), [tasks](telegram-mentor-contact/tasks.md) |
| Редактор/версии ТЗ | [spec](mentor-task-authoring/spec.md), [design](mentor-task-authoring/design.md), [tasks](mentor-task-authoring/tasks.md) |
| Понятность ТЗ | [spec](mentor-task-feedback/spec.md), [design](mentor-task-feedback/design.md), [tasks](mentor-task-feedback/tasks.md) |
| Цели и раскрываемые подзадачи | [spec](goal-subtask-disclosure/spec.md), [design](goal-subtask-disclosure/design.md), [tasks](goal-subtask-disclosure/tasks.md) |
| Реальная LLM и fallback | [spec](live-llm-reliability/spec.md), [design](live-llm-reliability/design.md), [tasks](live-llm-reliability/tasks.md) |
| Статистика затруднений | [spec](intern-difficulty-statistics/spec.md), [design](intern-difficulty-statistics/design.md), [tasks](intern-difficulty-statistics/tasks.md) |

Старая buddy-escalation superseded для v3. Reverse-onboarding по документации сохраняется;
новый task feedback независим от него. Стадия v3 — PLANNED, схем/миграций/кода пока нет.


Статус восьми фич: runtime v2 сведен в TL, реальный API A/B/feedback путь проверен;
offline browser приемка A/B/C/restart/ACL пройдена (4 PASS), live/CI отдельно. [Текущие результаты](../team/tl-readiness.md).
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
