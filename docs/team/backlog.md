# Backlog — назначения пяти участников

Редакция распределения · 2026-11-11. Пользователь — TL; остальные исполнители назначены
по указанным им ролям без вымышленных имён/handles. [Пакеты участникам](assignments/README.md),
[ветки и существующая QA-работа](branches.md), [границы каталогов](working-agreements.md).
Текущий TL integration snapshot: [результат](tl-readiness.md). Commit/push/PR не выполнялись.
Срок владельца — 2026-11-12 22:00 МСК; прежние дни ниже — исходный порядок зависимостей.

Статусы: READY — задача имеет входные решения и может стартовать после предоставления
рабочей базы владельцем; TODO — зависит от поставки; IN_PROGRESS — частичный результат;
EXTERNAL — внешний ресурс; DONE — фактическая приёмка. Review не считается полученным
отсутствием ответа. Первичное распределение было документационным; текущие TL tooling/infra результаты — в tl-readiness.md.

## Группирующие задачи (не отдельная дополнительная нагрузка)

| ID | Ответственный за сведение | Статус | Условие завершения |
|---|---|---|---|
| RP-DOC-01 | TL | DONE | Предыдущее перепланирование документации; его исторический отчёт сохранён |
| RP-CONTRACT-01 | TL | IN_PROGRESS | RP-CONTRACT-REVIEW-01 DONE; BE/AI schemas сведены; BE additions/FE retest/consumer acceptance еще нужны |
| RP-DATA-01 | TL | TODO | RP-DATA-BE-01 + RP-DATA-AI-01 + RP-DATA-TL-01 DONE |
| RP-AI-01 | AI Engineer | TODO | RP-AI-CORE-01 + RP-AI-DIAG-01 DONE; ранние потребители зависят только от CORE |

## P0: задачи с единственным ответственным

| ID | День | Ответственный | Статус | Зависимости | Результат / критерий done | Материалы |
|---|---|---|---|---|---|---|
| RP-TEAM-01 | 1 | TL | DONE | RP-DOC-01 | Назначения пяти ролей, существующие/планируемые ветки, bounded Fullstack и TL contract handoff; только docs | [спецификация](assignments/README.md) |
| RP-TL-01 | 1 | TL | DONE | RP-DOC-01 | Роли и reviewers назначены по поручению владельца; baseline policy в RP-CONTRACT-TL-01. Handles необязательны для старта, доступы не выданы | [спецификация](working-agreements.md) |
| RP-CONTRACT-TL-01 | 1 | TL | DONE | RP-DOC-01 | Scope/ownership/ACL/protocol/acceptance и authors зафиксированы; внешнее consumer review не выдумано | [спецификация](../architecture/contract-baseline.md) |
| RP-TL-AI-01 | 1 | TL | DONE | RP-CONTRACT-TL-01 | TL уточнения internal errors/таймеров/faults/sources и требований Docker/CI/ingest/UTF-8/eval review; только документация | [решения](../architecture/ai-integration-policy.md) |
| RP-CONTRACT-BE-01 | 1–2 | Backend | IN_PROGRESS | RP-CONTRACT-TL-01 | Common/public/journey/events/corporate schemas, examples/invalid cases, local validator и tests; без runtime реализации | [спецификация](contract-handoff.md) |
| RP-CONTRACT-AI-01 | 1–2 | AI Engineer | IN_PROGRESS | RP-CONTRACT-TL-01 | AI/knowledge/structured/SSE schemas и fixtures; common definitions согласуются с Backend | [спецификация](contract-handoff.md) |
| RP-CONTRACT-FE-01 | 1–2 | Frontend | IN_PROGRESS | RP-CONTRACT-BE-01, RP-CONTRACT-AI-01 | Проверены public DTO/SSE/error/nullability и typed fixture parsing, замечания переданы TL | [спецификация](contract-handoff.md) |
| RP-CONTRACT-REVIEW-01 | 1–2 | TL | IN_PROGRESS | RP-CONTRACT-BE-01, RP-CONTRACT-AI-01, RP-CONTRACT-FE-01 | BE↔AI/FE review и offline checks пройдены, зафиксирован принятый baseline; нет авансового DONE | [спецификация](contract-handoff.md) |
| RP-INF-01 | 2,6 | TL | IN_PROGRESS | Доступный Docker; финальная target проверка после RP-DATA-01 | Startup/Compose: clean up, schemas COPY, one-shot ingest, AI DB tests runner/fault env после AI поставки; migrate/seed дважды, role isolation/smoke; volume не удалять | [спецификация](../operations/development.md) |
| RP-DATA-BE-01 | 2 | Backend | TODO | RP-CONTRACT-01 | Новые app/corporate migrations, роли/constraints/IDs, component tests; applied 001 не переписана | [спецификация](../architecture/data-model.md) |
| RP-DATA-AI-01 | 2 | AI Engineer | TODO | RP-CONTRACT-01 | Новые kb ACL migrations и synthetic team/restricted/PII knowledge fixtures с согласованными IDs; без псевдоэмбеддингов | [спецификация](../architecture/data-model.md) |
| RP-DATA-TL-01 | 2 | TL | IN_PROGRESS | RP-DATA-BE-01, RP-DATA-AI-01 | Общий migrate/seed/verify-db/check tooling поддерживает v2, explicit UTF-8 и non-ASCII test, безопасный переход/повторяемость | [спецификация](../architecture/data-model.md) |
| RP-MOCK-01 | 2 | Backend | TODO | RP-DATA-01 | Persistent mock IAM/resources/assignments и app/corporate seed a+b team-a, c team-b, approver/docs-owner; knowledge поставляет AI | [спецификация](../features/authorization-and-privacy/spec.md) |
| RP-AUTH-01 | 2 | Backend | TODO | RP-DATA-01, RP-MOCK-01 | Cookie/Origin/CSRF, role/team/resource/document/ownership, negative tests; own backend coverage | [спецификация](../features/authorization-and-privacy/spec.md) |
| RP-JOURNEY-01 | 2 | Backend | TODO | RP-AUTH-01, RP-MOCK-01 | JSON DAG, goal/steps/dependencies/version, next action, initial IAM state; schema и template валидны | [спецификация](../features/onboarding-journey/spec.md) |
| RP-AI-CORE-01 | 2–3 | AI Engineer | TODO | RP-CONTRACT-01, RP-DATA-AI-01 | Offline generate/draft/retrieval/CLI, internal Error/ID, 20/25/85s provider/pipeline и fault fixtures по TL policy; не ждать Go | [спецификация](../features/contextual-ai-assistance/spec.md) |
| RP-AI-DIAG-01 | 4–5 | AI Engineer | TODO | RP-AI-CORE-01 | Safe classification/handoff/candidate/fallback; >=20 evals с assertions/ручным чтением, all safety pass, отчёт Backend/TL | [спецификация](../architecture/ai-design.md) |
| RP-CHAT-01 | 3 | Backend | TODO | RP-AUTH-01, RP-JOURNEY-01, RP-AI-CORE-01 | Persistent history/run/SSE/validation, cancel/retry/partial; не ждать diagnostic AI этапа дня 5 | [спецификация](../features/contextual-ai-assistance/spec.md) |
| RP-MOCK-02 | 3 | Backend | TODO | RP-MOCK-01 | Persistent request/scoped decision/grant, same-key replay/delayed grant; no timer approval | [спецификация](../features/access-request/spec.md) |
| RP-ACCESS-01 | 3 | Backend | TODO | RP-CHAT-01, RP-MOCK-02 | Validated draft/exact confirm/create/reconcile/approval ACL и IAM recheck; no duplicate | [спецификация](../features/access-request/spec.md) |
| RP-MOCK-03 | 4 | Backend | TODO | RP-MOCK-02 | Safe mock DB check: DB_SSL_REQUIRED/passed/denied/unavailable, correlation, no SQL/DSN | [спецификация](../features/readiness-verification/spec.md) |
| RP-VERIFY-01 | 4 | Backend | TODO | RP-JOURNEY-01, RP-ACCESS-01, RP-MOCK-03 | Trusted evidence, reducer/version conflict/dedup/stale/revoke tests и persistence; verified только по method | [спецификация](../features/readiness-verification/spec.md) |
| RP-BLOCKER-01 | 4 | Backend | TODO | RP-VERIFY-01 | Нормализация/Blocker/Friction/recovery; структурированная ошибка сохраняется независимо от AI availability | [спецификация](../features/blocker-detection/spec.md) |
| RP-BUDDY-01 | 4–5 | Backend | TODO | RP-BLOCKER-01, RP-CHAT-01, RP-AI-DIAG-01 | Exact diagnostic preview/confirm, scoped queue, atomic reply+resolved; ответ не verified | [спецификация](../features/buddy-escalation/spec.md) |
| RP-REVERSE-01 | 5 | Backend | TODO | RP-BLOCKER-01, RP-AI-DIAG-01 | Distinct>=2, unique candidate, safe enrichment/fallback, scoped review; accepted не publish | [спецификация](../features/reverse-onboarding/spec.md) |
| RP-FE-01 | 2 | Frontend | IN_PROGRESS | RP-CONTRACT-01 | Goal-first reference layout и states на agreed DTO fixtures (явно mock); component tests/responsiveness | [спецификация](../features/onboarding-journey/spec.md) |
| RP-FE-02 | 3–4 | Frontend | TODO | RP-FE-01; по поставке RP-JOURNEY-01, RP-CHAT-01, RP-ACCESS-01, RP-VERIFY-01, RP-BLOCKER-01 | Go integration goal/chat/preview/requests/approvals/checks, refresh; принимать API поставки поэтапно | [спецификация](../features/access-request/spec.md) |
| RP-FE-03 | 4–5 | Frontend | TODO | RP-FE-02, RP-BUDDY-01, RP-REVERSE-01 | Buddy и documentation-owner UI, safe snapshot/count/hypothesis/review; no hidden fixture runtime | [спецификация](../features/reverse-onboarding/spec.md) |
| RP-E2E-01 | 2–6 | Frontend | TODO | RP-CONTRACT-01; полный прогон после RP-FE-03 | Браузерный A/B/C путь и UI/security assertions, reload; реальный backend restart с TL, без route interception | [спецификация](../testing/strategy.md) |
| RP-QA-01 | 2–3 | Fullstack–QA–Integration | IN_PROGRESS | Обновлённая QA-ветка владельцем, RP-CONTRACT-01; запуск после RP-AUTH-01, RP-JOURNEY-01 | Только два имеющихся API-теста: v2 goal ownership/reread и 401/CSRF; один отчёт. Legacy подготовка есть, v2 ещё нет | [спецификация](assignments/fullstack-qa-integration.md) |
| RP-INTEGRATION-01 | 6 | TL | TODO | RP-INF-01, RP-DATA-01, RP-AI-01, RP-REVERSE-01, RP-BUDDY-01, RP-FE-03, RP-E2E-01, RP-QA-01 | Свести component reports и full A/B/C/security/offline/restart результаты; дефекты исправляют владельцы, QA не переписывает всё | [спецификация](../product/demo.md) |
| RP-DEMO-01 | 7 | TL | TODO | RP-INTEGRATION-01, RP-TL-02 | README/clean seed rehearsal/PDF/video, пять минут и честный mock/live; Frontend даёт UI capture в рамках E2E | [спецификация](../product/demo.md) |

Fullstack–QA–Integration имеет **ровно одну** bounded задачу RP-QA-01. Mock/IAM/DB checks,
seed, миграции, Compose/CI, все component tests, browser E2E и итоговая приёмка ему не
назначаются. Tests/coverage своего кода выполняет каждый владелец; отсутствие QA в строке
не отменяет security приёмку. Детальная зона каждого ID — в handoff соответствующей роли.
Backend имеет наибольшую реализацию; TL снимает общие scripts/infra/demo/contract coordination,
AI обеспечивает оба AI этапа, Frontend владеет browser E2E. Это минимальный scope Fullstack,
а не переименование большого интеграционного пакета в одну задачу.

## Внешние решения и P1/P2

| ID | Приоритет | Ответственный | Статус / зависимость | Результат |
|---|---|---|---|---|
| RP-TL-02 | P0 | TL | EXTERNAL: оригиналы кейса/сроки/формат | Сверить требования/coverage/PDF/video; не блокировать независимый offline development |
| RP-AI-02 | P1 | AI Engineer | EXTERNAL: provider/key/budget от TL; RP-AI-01 | AI предлагает provider/model/embeddings/client/deps; TL подтверждает key/budget до spike. Live report отдельный, offline не блокируется |
| RP-HOST-01 | P2 | TL | EXTERNAL: площадка/auth/HTTPS | Public demo только отдельным решением владельца |
| RP-P1-01 | P1 | TL | TODO после стабильного P0 | Назначить расширения graph/second journey/review history по Product Spec, не раздавать заранее |
| RP-P2-01 | P2 | TL | TODO после хакатона | Отдельный scope реальных интеграций/MR/IDE/Radar/HR/workflow builder |

## Последовательность и точки передачи

1. Сейчас: BE+AI schemas уже предъявлены, TL выполнил техническую проверку и решения по FE review.
   Backend дополняет StepActionList/null negatives, Frontend синхронизирует bindings, BE↔AI фиксируют review.
2. Contract gate: BE/AI файлы → FE consumer check → TL review → RP-CONTRACT-01 DONE →
   владелец распространяет одну принятую базу в рабочие ветки.
3. Data: Backend app/corporate и AI kb/knowledge параллельны; TL подключает общий runner.
   Затем Backend seed/IAM/auth/journey. AI CORE использует согласованные fixtures независимо
   от готовности всех Go endpoints. FE layout стартует с принятого DTO.
4. Access: AI CORE → Go chat + mock request/approval → controlled access/grant recheck.
   Не ждать AI DIAG дня 5 для начала access UI/Go.
5. Verification и диагностика: mock DB → evidence → blocker; AI DIAG и Go buddy/reverse;
   Frontend подключает готовые endpoints постепенно, а не одним merge в конце недели.
6. Fullstack передаёт два адаптированных API-теста; Frontend — browser E2E; Backend/AI —
   свои coverage/security reports. TL проводит настоящую общую интеграцию и demo rehearsal.

| День | Наблюдаемый checkpoint |
|---|---|
| 1 | Пять handoff, TL baseline, authors/reviewers и схемы в работе |
| 2 | Принятый contract, migrations/seed/IAM/auth, разрешённая цель и состояние доступа |
| 3 | Draft/confirm/отдельное approval/grant recheck, основной API smoke |
| 4 | Connection success/DB_SSL_REQUIRED/evidence/blocker; diagnostic handoff интегрируется |
| 5 | Buddy/recheck, второй intern, единственный candidate и owner review |
| 6 | Full browser/API/security/offline/restart, coverage >80%, дефекты исправлены владельцами |
| 7 | Чистая репетиция, README/PDF/video, запас исправлений |

Если оценки команды превышают неделю, TL пересматривает сроки/порядок P1/P2, не убирает
P0 ACL/confirm/evidence/error/feedback/offline и не расширяет молча задачу Fullstack.

## Legacy backlog — superseded, не второй обязательный план

| Старые ID | Замена / причина |
|---|---|
| TL-01, TL-02 | RP-TL-01/RP-TL-02; публикация и доступы только владелец |
| INF-01, INF-02 | RP-INF-01; CI/protection остаётся у владельца, не агентская Git-операция |
| BE-01 | RP-AUTH-01, расширенная модель ролей/ACL |
| BE-02 | RP-JOURNEY-01/RP-VERIFY-01; ручной task PATCH/done отменён |
| FE-01, FE-02 | RP-FE-01/02; иерархия goal/evidence вместо checklist |
| QA-01 | RP-QA-01 у Fullstack: адаптация двух уже написанных API-тестов в feature/qa-01-m1; browser/restart отдельно RP-E2E-01 |
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

## Фактическая TL поставка · 2026-11-12

RP-INF-01: clean legacy Compose startup/migrate/seed twice/isolation/liveness и image
contracts проверены в отдельном проекте. Target ingest/readiness/AI DB runner wiring
подготовлено, ждет AI CLI/tests. RP-DATA-TL-01: UTF-8/hash regression и общий migration
runner готовы; v2 seed/layout/IDs еще не поставлены, поэтому задача не DONE.
RP-FE-01: remote fixture UI/build/171 tests есть, coverage 48.09%, компонентная приемка
не пройдена. RP-QA-01 остается legacy: base conflict/adaptation/run еще нужны.
RP-TL-02: срок 12 ноября 22:00 подтвержден; оригинальные условия/формат не предоставлены.
RP-INTEGRATION-01/RP-DEMO-01 нельзя закрыть до настоящего A/B/C/security/offline/restart.
Полный результат/ограничения: [TL record](tl-readiness.md).

Оперативная передача к 12 ноября 22:00: [временный checklist](MVP_UNBLOCK_DELETE_AFTER_RESOLUTION.md).
Удалить файл/ссылку после выполнения его условий; постоянный evidence остается в TL record.

Для DATA gate BE/AI передают layout/IDs/минимальные seed test inputs вместе с миграциями,
не ожидая mock HTTP/AI CORE. Иначе ожидание TL полного RP-MOCK-01 создало бы цикл
DATA → MOCK → seed layout → DATA. Ingest/AI DB runtime приемка относится к INF после CORE.
