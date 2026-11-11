# Backlog — Engineering Onboarding & Feedback Loop

Версия 2.0 · 2026-11-11. Дни относительны старту согласованной недели, не вымышленные
календарные обещания. Пять ролей/директорий в [working agreements](working-agreements.md).
Ни одна продуктовая фича ещё не реализована. [SDD index](../features/README.md).
RP-DOC-01 DONE означает завершение документационной работы и проверок; TL/consumer
review и исполняемые v2 schemas остаются в RP-CONTRACT-01, не заявлены выполненными.
READY — можно после назначения человека; TODO — ждёт зависимостей; IN_PROGRESS — частично;
EXTERNAL — внешний ресурс; DONE — фактическая приёмка. Спецификация не означает DONE.

## P0: обязательный недельный путь

| ID / день | Владелец; зона | Статус | Зависимости | Результат / критерий done | Спецификация |
|---|---|---|---|---|---|
| RP-DOC-01 / 1 | TL/docs; Markdown | DONE | Новый brief | Подготовлен единый набор vision/spec/ADR/8 SDD/API/events/backlog/demo; ссылки и make check проходят, код не изменён | [audit](replan-audit.md) |
| RP-TL-01 / 1 | TL; docs/team | READY | — | Назначены 5 людей/reviewers; подтверждены policy/допущения и общий target contract | [agreements](working-agreements.md) |
| RP-CONTRACT-01 / 1–2 | TL + BE/AI/FE; contracts/, docs/, contract tests | READY | RP-DOC-01 | TL/consumer review, executable v2 schemas/examples для API/AI/template/events, invalid fixtures и validators согласованы синхронно; v1 явно legacy | [API](../architecture/api-contracts.md) |
| RP-INF-01 / 2,6 | Fullstack/QA; Compose/scripts/CI | IN_PROGRESS | Docker; target data проверки после RP-DATA-01 | Чистый up, migrate/seed дважды, DB role isolation, smoke; после интеграции весь offline demo, зафиксированы реальные результаты | [development](../operations/development.md) |
| RP-DATA-01 / 2 | Backend + AI + Fullstack; migrations/scripts | TODO | RP-CONTRACT-01 | Новые app/kb/corporate migrations, роли/ACL/evidence/candidates, old checksum сохранён, повтор и ограничения проверены | [data](../architecture/data-model.md) |
| RP-AUTH-01 / 2 | Backend; backend/ | TODO | RP-CONTRACT-01, RP-DATA-01 | Cookie/Origin/CSRF, role/team/resource/document/ownership policies, отрицательные проверки; ни одного self-approval | [auth](../features/authorization-and-privacy/spec.md) |
| RP-MOCK-01 / 2 | Fullstack/QA + AI; mock-services/, data/ | TODO | RP-CONTRACT-01, RP-DATA-01 | Synthetic IAM/resources/ACL, a+b команда A, c команда B, approver/docs-owner, DB instructions/restricted/PII fixtures; seed не стирает прогресс | [auth](../features/authorization-and-privacy/spec.md) |
| RP-JOURNEY-01 / 2 | Backend; backend/, template data | TODO | RP-AUTH-01, RP-MOCK-01 | Один утверждённый JSON DAG, goal/steps/dependencies/version, разрешённый ресурс и следующий шаг; no PATCH done | [journey](../features/onboarding-journey/spec.md) |
| RP-AI-01 / 2–5 | AI; ai-service/, data/knowledge/ | TODO | RP-CONTRACT-01, RP-MOCK-01 | Offline provider всех structured операций, pre-LLM ACL, safe citations, >=20 evals; нет сетевых вызовов CI | [AI](../features/contextual-ai-assistance/spec.md) |
| RP-CHAT-01 / 3 | Backend; backend/ | TODO | RP-AUTH-01, RP-JOURNEY-01, RP-AI-01 | History/run/SSE, schema validation, cancel/retry/partial persistence; Python не исполняет tools | [AI](../features/contextual-ai-assistance/spec.md) |
| RP-MOCK-02 / 3 | Fullstack/QA; mock-services/ | TODO | RP-MOCK-01, RP-AUTH-01 | Persistent submitted request, scoped manual approval/reject и IAM grant; same-key replay, никакого auto-approve | [access](../features/access-request/spec.md) |
| RP-ACCESS-01 / 3 | Backend; backend/ | TODO | RP-CHAT-01, RP-MOCK-02 | AI draft валидируется, exact confirm отправки, idempotent create/reconcile и отдельное approval; grant recheck | [access](../features/access-request/spec.md) |
| RP-MOCK-03 / 4 | Fullstack/QA; mock-services/ | TODO | RP-MOCK-02 | Safe DB check: SSL failure/passed/denied/unavailable; нет SQL/DSN, correlated results | [verify](../features/readiness-verification/spec.md) |
| RP-VERIFY-01 / 4 | Backend; backend/ | TODO | RP-JOURNEY-01, RP-ACCESS-01, RP-MOCK-03 | Trusted evidence, state reducer, duplicate/stale/revoke tests; verified только после IAM+connection evidence | [verify](../features/readiness-verification/spec.md) |
| RP-BLOCKER-01 / 4 | Backend + AI; backend/, ai-service/ | TODO | RP-VERIFY-01 | Safe normalization, persistent blocker/friction, causal recovery; raw logs/PII исключены | [blocker](../features/blocker-detection/spec.md) |
| RP-BUDDY-01 / 4 | Backend; backend/ | TODO | RP-BLOCKER-01, RP-CHAT-01 | Exact diagnostic snapshot/confirm/intersection ACL, assigned queue и atomic reply+resolved; recheck после ответа | [buddy](../features/buddy-escalation/spec.md) |
| RP-REVERSE-01 / 5 | Backend + AI; backend/, ai-service/ | TODO | RP-BLOCKER-01, RP-AI-01 | Трёхчастный ключ, distinct>=2, один candidate, safe AI enrichment/fallback, scoped owner review, no auto-publish | [reverse](../features/reverse-onboarding/spec.md) |
| RP-FE-01 / 2 | Frontend; frontend/ | TODO | RP-CONTRACT-01; reference | Общий layout/tokens, goal/step/evidence/blocker, approved DTO fixtures помечены; loading/error/empty/forbidden/mobile | [journey](../features/onboarding-journey/spec.md) |
| RP-FE-02 / 3–4 | Frontend; frontend/ | TODO | RP-FE-01; поэтапно RP-JOURNEY-01, RP-CHAT-01, RP-ACCESS-01, RP-VERIFY-01, RP-BLOCKER-01 | Реальный Go: route/chat/preview/confirm/requests/approvals/checks, factual statuses, refresh; без fixture перехвата API | [access](../features/access-request/spec.md) |
| RP-FE-03 / 4–5 | Frontend; frontend/ | TODO | RP-FE-02, RP-BUDDY-01, RP-REVERSE-01 | Минимальные buddy queue/detail/reply и docs-owner candidate/review с count/error/instruction/hypothesis | [reverse](../features/reverse-onboarding/spec.md) |
| RP-QA-01 / 1–6 | Fullstack/QA + component owners; tests/component/E2E | TODO | RP-CONTRACT-01; выполнение по готовности API | Сначала acceptance fixtures/планы; затем happy/negative/security/retry/restart/offline tests, line coverage >80% каждого компонента | [testing](../testing/strategy.md) |
| RP-INTEGRATION-01 / 6 | Все, QA координатор | TODO | Все P0 implementation задачи выше, RP-INF-01, RP-QA-01 | Полный A/B/C E2E, роли/PII/injection, grant delay, unknown/reconcile, offline без ключа; отчёты/ограничения честны | [demo](../product/demo.md) |
| RP-DEMO-01 / 7 | TL + Fullstack/QA; docs/demo artifacts | TODO | RP-INTEGRATION-01, RP-TL-02 | Чистый seed сценария, 5-мин rehearsal, README, PDF/видео проверены; весь feedback loop показан, без скрытых SQL-правок | [demo](../product/demo.md) |

RP-FE-02, RP-AI-01 и RP-QA-01 допускают поэтапную реализацию в течение указанных дней;
это не требование ждать дня 4 для начала UI или дня 6 для первых тестов. Checkpoints
фиксируют готовый результат, не только выполнение задач одним компонентом.

## Внешние решения и необязательные расширения

| ID / приоритет | Владелец | Статус / зависимость | Результат |
|---|---|---|---|
| RP-TL-02 / P0, день 1–7 | TL | EXTERNAL: оригиналы кейса/интервью/исследования | Сверить coverage/формат сдачи/сроки и приложить реальные ссылки; не блокирует независимый offline development |
| RP-AI-02 / P1 | AI + TL | EXTERNAL: provider/key/budget, затем RP-AI-01 | Live tool calling/streaming/embeddings и отдельный quality/cost report; не блокирует P0 fallback |
| RP-HOST-01 / P2 | TL + Fullstack | EXTERNAL: площадка/auth | Public demo только с HTTPS/защищённым входом; hosting/permissions настраивает владелец |
| RP-P1-01 / P1 | TL + component owners | TODO после стабильного P0 | Второй journey, graph/next-action UI, расширенный buddy/review history, retrieval/evidence UX/новые проверки по Product Spec |
| RP-P2-01 / P2 | TL | TODO после хакатона | Реальные интеграции, MR/code style/IDE, semantic clustering/Radar, workflow builder/аналитика и HR; отдельный scope |

## Контрольные точки недели

| День | Готовый результат |
|---|---|
| 1 | Vision/spec/SDD, роли/permissions, API/events и acceptance согласованы; реализация использует один контракт |
| 2 | DB/migrations, synthetic users/policies, mock IAM, JSON journey; пользователь видит маршрут и фактическое отсутствие доступа |
| 3 | Draft → validation → confirm → create → отдельный approval → IAM grant recheck; no duplicate |
| 4 | Safe connection check/evidence, SSL error/blocker, диагностический handoff/reply/recheck; success отличим от claim |
| 5 | Второй intern той же команды, повтор ошибки, один candidate и карточка документационному owner |
| 6 | Настоящий E2E, negative security, offline fallback и coverage >80%; интеграционные дефекты исправлены |
| 7 | Повторяемый seed/setup, README, PDF/video, пятиминутное demo и запас исправлений |

Независимые работы после RP-CONTRACT-01: FE fixtures/layout, QA acceptance tests,
AI adapters и mock implementation; auth/data/journey требуют указанных зависимостей.
Сокращения допускаются только в P1/P2: P0 RBAC/confirm/verification/error/feedback/offline не вычёркиваются.

## Legacy backlog — superseded, не второй обязательный план

| Старые ID | Замена / причина |
|---|---|
| TL-01, TL-02 | RP-TL-01/RP-TL-02; публикация и доступы только владелец |
| INF-01, INF-02 | RP-INF-01; CI/protection остаётся у владельца, не агентская Git-операция |
| BE-01 | RP-AUTH-01, расширенная модель ролей/ACL |
| BE-02 | RP-JOURNEY-01/RP-VERIFY-01; ручной task PATCH/done отменён |
| FE-01, FE-02 | RP-FE-01/02; иерархия goal/evidence вместо checklist |
| QA-01 | RP-QA-01; новые journey/security критерии вместо старого M1 task-status |
| AI-01, AI-03 | RP-AI-02 (live P1), scoped offline P0 в RP-AI-01 |
| AI-02 | RP-AI-01: все structured операции, не только mock chat |
| BE-03, FE-03 | RP-CHAT-01/RP-FE-02: goal/step context и SSE |
| BE-04, BE-05 | RP-MOCK-01/02/03, RP-ACCESS-01; repo/15s auto-approval заменены DB/manual approval |
| BE-06, FE-04 | RP-BUDDY-01/RP-FE-03; дополнена диагностика и candidate UI |
| QA-02 | RP-QA-01/RP-INTEGRATION-01, полный feedback loop |
| DEMO-01, DEMO-02 | RP-HOST-01/RP-DEMO-01, local offline demo P0 |

## Унаследованное состояние INF-01 · наблюдения 2026-11-10

- Исправлен отсутствовавший golang:1.27.4-alpine на 1.27.3; manifests и Dockerfile согласованы.
- Доступность базовых образов amd64/arm64 тогда проверена; это не Compose smoke.
- Исторически make check: 18 tests, frontend build и bootstrap AI/mock прошли; backend
  vet/build/CGO-disabled amd64/arm64 на локальном Go 1.27.4 прошли. Лог владельца подтвердил
  Docker-сборку Go 1.27.3 и остальных образов. Это не новые результаты документационной задачи.
- Запуск владельца остановился на PostgreSQL exit 126, bootstrap bind mount: Permission denied.
  Добавлен Dockerfile.postgres с COPY --chmod=755 вместо bind mount.
- После исправления контейнеры/volume не запускались/не удалялись по просьбе владельца.
  Чистый up, повтор migrate/seed, verify-db/smoke до сих пор требуют подтверждения.
  RP-INF-01 сохраняет IN_PROGRESS; текущая документационная задача контейнеры не запускает.
