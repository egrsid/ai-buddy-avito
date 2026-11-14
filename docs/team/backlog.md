**V4 planning:** [новый backlog и role handoff](../v4/delivery.md).
В текущем проходе только Markdown в docs/v4-planning; runtime v4 TODO.
[Архитектура](../v4/architecture.md), [приёмка](../v4/testing.md).

**14 ноября, v3 runtime:** локальная интеграция завершена и offline demo проверен;
[приёмка, проверки и открытые live/race/CI gates](../v3/integration-acceptance-2026-11-14.md).
Нижние docs-only/PLANNED записи — история предыдущих поручений.

# Backlog — назначения пяти участников

**Новый план v3:** [backlog/owners/dependencies/allowed directories/DoD](../v3/delivery.md),
[пакет](../v3/README.md). Сначала docs/contract gate, runtime v3 ещё TODO. Исторические
RP/S1–S4 задачи ниже не назначаются заново. Текущий проход — только docs/v3-planning;
код, contracts JSON, SQL, seed, env, Docker/CI и данные не менять.

Текущее поручение владельца: TL + QA + AI доводят local demo, только в своих branches.
В TL checkout выполнены consumer integration fixes и полная QA browser приемка:
4 PASS, включая A/B/C/restart/ACL; 475 FE tests/94.34%, 57 shared tests, 5 AI DB tests.
Стандартный чистый стенд готов: `make demo-offline`, http://localhost:15173.
BE/FE branches/refs не менялись; исходный RP-QA-01 сохранен. [Факты и границы](tl-readiness.md).
Историческое ограничение QA только двумя smoke ниже этим новым поручением расширено.


## RP-INTEGRATION-01 · локальный main · 13 ноября

По поручению владельца main объединяет TL b0e5529 и финальный AI snapshot 9b54700
с проверенными локальными исправлениями. Весь runtime совпадает с принятой AI worktree;
история происхождения сохранена. Каноническая сборка из корня main: `make main-demo`.
Повторно: shared 57 PASS, FE 494/94.78%, AI 457/99.75%. БД пользователя не сбрасывается.
Push/PR не выполнялись; remote main обновляется владельцем. Live/CI/formal review gates
не подменяются локальной приемкой. [Факты](tl-readiness.md).


## RP-INTEGRATION-01 · последняя поставка AI/FE · 13 ноября

Remote AI 25ac58f и FE c814283 сопоставлены с owner d9792ce. AI resilience/prompt/query
embedding delta и совместимые FE tests/fixtures включены в TL; роли/Markdown/встроенный
чат сохранены. Backend/QA refs не менялись. AI 453/99.71%, FE 484/94.62%, shared 57 PASS.
Browser нашёл и регрессионно покрыт check/version race: controls disabled до свежего GET step.
Report live AI предъявлен (13/13 automated), но не заменяет manual quality/final consumer
review и не является повторным paid прогоном TL. Матрица решений и remaining gates:
[TL record](tl-readiness.md), [ветки](branches.md).


## RP-DEMO-UX-01 · замечания владельца · 13 ноября

DONE локально в TL: читаемые Markdown-инструкции и ответы AI со ссылками;
recovery UI учитывает open blocker + актуальный Go allowlist; 4 основные роли без
технических суффиксов, дополнительные участники отдельно. Владелец интеграции TL/QA/AI,
зоны FE consumer/AI prompting/fallback/tests/docs; новые BE схемы/миграции не нужны.
Зависимости RP-FE-02/03 → текущие Step.available_actions/blockers и Source → knowledge ACL,
RP-AI-CORE-01 → readable string/citations; Go по-прежнему проверяет draft/confirm.
FE 482 tests/94.50%, AI 445/99.61%, browser 4/4, KB DB 5/5, shared 57 PASS.
Live acceptance RP-AI-02 и formal consumer approval этим не закрыты.
[Матрица FE/BE зависимостей и evidence](tl-readiness.md).


## Актуальный checkpoint · 13 ноября

BE ea2cfbe, AI aa6ff38, FE 3ea1d01, QA f88228c импортированы в TL без commit/merge.
Реальный AI/Go/corporate/DB путь и два QA tests PASS; полное demo **не DONE**.
Порядок работы: FE login/session → contextual draft/confirm → SSL disable/require →
intern-b/c → browser A/B/C; TL clean image/CI/race; AI live safety обоих моделей.
[Команды, source provenance, coverage и приемка](tl-readiness.md).
RP-DATA-TL-01/RP-INF-01 получили реальные ingest/DB/v2 verify результаты, остаются
IN_PROGRESS до clean build/CI. RP-AI-02 получил реализацию ordered failover/notice,
но live quality/account acceptance не завершена. RP-CONTRACT-REVIEW-01 требует
явного consumer approval, несмотря на зеленые schemas/FE tests и настоящий API прогон.
Исторические разделы ниже не являются новым списком отсутствующего runtime.


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
| RP-AI-01 | AI Engineer | IN_PROGRESS | RP-AI-CORE-01 + RP-AI-DIAG-01 DONE; ранние потребители зависят только от CORE |

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
| RP-DATA-BE-01 | 2 | Backend | IN_PROGRESS | RP-CONTRACT-01 | Новые app/corporate migrations, роли/constraints/IDs, component tests; applied 001 не переписана | [спецификация](../architecture/data-model.md) |
| RP-DATA-AI-01 | 2 | AI Engineer | IN_PROGRESS | RP-CONTRACT-01 | Новые kb ACL migrations и synthetic team/restricted/PII knowledge fixtures с согласованными IDs; без псевдоэмбеддингов | [спецификация](../architecture/data-model.md) |
| RP-DATA-TL-01 | 2 | TL | IN_PROGRESS | RP-DATA-BE-01, RP-DATA-AI-01 | Общий migrate/seed/verify-db/check tooling поддерживает v2, explicit UTF-8 и non-ASCII test, безопасный переход/повторяемость | [спецификация](../architecture/data-model.md) |
| RP-MOCK-01 | 2 | Backend | IN_PROGRESS | RP-DATA-01 | Persistent mock IAM/resources/assignments и app/corporate seed a+b team-a, c team-b, approver/docs-owner; knowledge поставляет AI | [спецификация](../features/authorization-and-privacy/spec.md) |
| RP-AUTH-01 | 2 | Backend | IN_PROGRESS | RP-DATA-01, RP-MOCK-01 | Cookie/Origin/CSRF, role/team/resource/document/ownership, negative tests; own backend coverage | [спецификация](../features/authorization-and-privacy/spec.md) |
| RP-JOURNEY-01 | 2 | Backend | IN_PROGRESS | RP-AUTH-01, RP-MOCK-01 | JSON DAG, goal/steps/dependencies/version, next action, initial IAM state; schema и template валидны | [спецификация](../features/onboarding-journey/spec.md) |
| RP-AI-CORE-01 | 2–3 | AI Engineer | IN_PROGRESS | RP-CONTRACT-01, RP-DATA-AI-01 | Offline generate/draft/retrieval/CLI, internal Error/ID, 20/25/85s provider/pipeline и fault fixtures по TL policy; не ждать Go | [спецификация](../features/contextual-ai-assistance/spec.md) |
| RP-AI-DIAG-01 | 4–5 | AI Engineer | IN_PROGRESS | RP-AI-CORE-01 | Safe classification/handoff/candidate/fallback; >=20 evals с assertions/ручным чтением, all safety pass, отчёт Backend/TL | [спецификация](../architecture/ai-design.md) |
| RP-CHAT-01 | 3 | Backend | IN_PROGRESS | RP-AUTH-01, RP-JOURNEY-01, RP-AI-CORE-01 | Persistent history/run/SSE/validation, cancel/retry/partial; не ждать diagnostic AI этапа дня 5 | [спецификация](../features/contextual-ai-assistance/spec.md) |
| RP-MOCK-02 | 3 | Backend | IN_PROGRESS | RP-MOCK-01 | Persistent request/scoped decision/grant, same-key replay/delayed grant; no timer approval | [спецификация](../features/access-request/spec.md) |
| RP-ACCESS-01 | 3 | Backend | IN_PROGRESS | RP-CHAT-01, RP-MOCK-02 | Validated draft/exact confirm/create/reconcile/approval ACL и IAM recheck; no duplicate | [спецификация](../features/access-request/spec.md) |
| RP-MOCK-03 | 4 | Backend | IN_PROGRESS | RP-MOCK-02 | Safe mock DB check: DB_SSL_REQUIRED/passed/denied/unavailable, correlation, no SQL/DSN | [спецификация](../features/readiness-verification/spec.md) |
| RP-VERIFY-01 | 4 | Backend | IN_PROGRESS | RP-JOURNEY-01, RP-ACCESS-01, RP-MOCK-03 | Trusted evidence, reducer/version conflict/dedup/stale/revoke tests и persistence; verified только по method | [спецификация](../features/readiness-verification/spec.md) |
| RP-BLOCKER-01 | 4 | Backend | IN_PROGRESS | RP-VERIFY-01 | Нормализация/Blocker/Friction/recovery; структурированная ошибка сохраняется независимо от AI availability | [спецификация](../features/blocker-detection/spec.md) |
| RP-BUDDY-01 | 4–5 | Backend | IN_PROGRESS | RP-BLOCKER-01, RP-CHAT-01, RP-AI-DIAG-01 | Exact diagnostic preview/confirm, scoped queue, atomic reply+resolved; ответ не verified | [спецификация](../features/buddy-escalation/spec.md) |
| RP-REVERSE-01 | 5 | Backend | IN_PROGRESS | RP-BLOCKER-01, RP-AI-DIAG-01 | Distinct>=2, unique candidate, safe enrichment/fallback, scoped review; accepted не publish | [спецификация](../features/reverse-onboarding/spec.md) |
| RP-FE-01 | 2 | Frontend | IN_PROGRESS | RP-CONTRACT-01 | Goal-first reference layout и states на agreed DTO fixtures (явно mock); component tests/responsiveness | [спецификация](../features/onboarding-journey/spec.md) |
| RP-FE-02 | 3–4 | Frontend | IN_PROGRESS | RP-FE-01; по поставке RP-JOURNEY-01, RP-CHAT-01, RP-ACCESS-01, RP-VERIFY-01, RP-BLOCKER-01 | Go integration goal/chat/preview/requests/approvals/checks, refresh; принимать API поставки поэтапно | [спецификация](../features/access-request/spec.md) |
| RP-FE-03 | 4–5 | Frontend | IN_PROGRESS | RP-FE-02, RP-BUDDY-01, RP-REVERSE-01 | Buddy и documentation-owner UI, safe snapshot/count/hypothesis/review; no hidden fixture runtime | [спецификация](../features/reverse-onboarding/spec.md) |
| RP-E2E-01 | 2–6 | QA/TL, текущий проход | DONE | RP-CONTRACT-01; полный прогон после RP-FE-03 | Браузерный A/B/C путь и UI/security assertions, reload; реальный backend restart с TL, без route interception | [спецификация](../testing/strategy.md) |
| RP-QA-01 | 2–3 | Fullstack–QA–Integration | DONE | v2 auth/journey | Два авторских v2 API tests сохранены и выполнены TL: 2 PASS; ownership/reread/401/CSRF. Это не browser A/B/C | [evidence](tl-readiness.md) |
| RP-INTEGRATION-01 | 6 | TL | IN_PROGRESS | RP-INF-01, RP-DATA-01, RP-AI-01, RP-REVERSE-01, RP-BUDDY-01, RP-FE-03, RP-E2E-01, RP-QA-01 | Свести component reports и full A/B/C/security/offline/restart результаты; дефекты исправляют владельцы, QA не переписывает всё | [спецификация](../product/demo.md) |
| RP-DEMO-01 | 7 | TL | TODO | RP-INTEGRATION-01, RP-TL-02 | README/clean seed rehearsal/PDF/video, пять минут и честный mock/live; Frontend даёт UI capture в рамках E2E | [спецификация](../product/demo.md) |

Fullstack–QA–Integration имеет **ровно одну** bounded задачу RP-QA-01. Mock/IAM/DB checks,
seed, миграции, Compose/CI, все component tests, browser E2E и итоговая приёмка ему не
назначаются. Tests/coverage своего кода выполняет каждый владелец; отсутствие QA в строке
не отменяет security приёмку. Детальная зона каждого ID — в handoff соответствующей роли.
Backend имеет наибольшую реализацию; TL снимает общие scripts/infra/demo/contract coordination,
AI обеспечивает оба AI этапа, Frontend владеет browser E2E. Это минимальный scope Fullstack,
а не переименование большого интеграционного пакета в одну задачу.

## Внешние решения и live MVP / P1 / P2

| ID | Приоритет | Ответственный | Статус / зависимость | Результат |
|---|---|---|---|---|
| RP-TL-02 | P0 | TL | EXTERNAL: оригиналы кейса/сроки/формат | Сверить требования/coverage/PDF/video; не блокировать независимый offline development |
| RP-AI-02 | MVP/live, отдельно от offline P0 | AI Engineer | EXTERNAL: key/оплата; подготовка/smoke возможны сейчас, полная приёмка после RP-AI-01 | ai-sage/GigaChat3.5-432B-A28B без Reasoning, BAAI/bge-m3; AI сам выполняет всю LLM-specific интеграцию/env/deps/locks/Compose/CI и расходы без approval TL. Бюджет 1000/stop 800 ₽; persistent reserve/usage guard, output cap, TTFT 20s, optional QA cache/ACL и embedding profile/reindex tests. Ключ/оплата/реализация не подтверждены; [детали приёмки](../AI_ENGINEERING_STRATEGY.md) |
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
| AI-01, AI-03 | RP-AI-02 (теперь live MVP по поручению владельца), scoped offline P0 в RP-AI-01 |
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

## Повторная AI-поставка · 2026-11-12

[Review 3f955322](ai-review-2026-11-12.md): семь commits, 38 файлов; offline internal
API/SSE/retrieval/diagnostics и семь synthetic документов. Независимо: 184 tests,
99.90% coverage, 29/29 evals, 18/18 safety, 8/8 retrieval; AI tests проходят также
с TL contract snapshot. Ниже остаток внутри существующих RP-задач, без нового scope:

| Задача | Поставлено | Остаток до DONE |
|---|---|---|
| RP-DATA-AI-01 | Семь Markdown документов с ACL/UUID/version | AI-R1: kb migrations/storage, согласование IDs/ACL с BE |
| RP-AI-CORE-01 | Offline HTTP/SSE/provider/retrieval/journey/draft и unit tests | AI-R1 ingest/readiness/DB tests; AI-R2 response bounds/validation; AI-R3 deadlines; BE consumer review |
| RP-AI-DIAG-01 | Classification/handoff/candidate и 29 evals | AI-R4 nonzero при любом failed P0 case; ручное чтение полных outputs, BE safety review, интеграция |
| RP-CHAT-01 | Потребитель теперь имеет реальный AI HTTP для ранних tests | Go history/run/SSE, повторная schema validation/90s terminal race, persist/confirm остаются Backend |
| RP-DATA-TL-01 / RP-INF-01 | Общие runners/overlay уже в TL fe870967 | После AI-R1/BE layout реальный ingest/readiness/DB acceptance; eval CLI не заменяет DB tests |

Parent RP-AI-01 IN_PROGRESS; высокий coverage не закрывает дефекты или persistent data.
RP-CONTRACT-01 остается IN_PROGRESS: StepActionList/null cases, FE retest и явное BE↔AI
approval не заменены тестами AI. FE/QA scope прежний. Срочный порядок и срок 22:00 —
[временный список](MVP_UNBLOCK_DELETE_AFTER_RESOLUTION.md).

## Дополнение P0 v3: цели / live LLM / статистика

PLANNED, только docs. Источник: [расширенный delivery](../v3/delivery.md).
V3-GOALS-BE-01/FE-01 — список всех своих целей с progress и раскрываемыми steps;
V3-LLM-DIAG-01/LIVE-01/OBS-01 — effective mode и primary evidence перед настройкой
таймаутов, origin/status в contracts; V3-STATS-BE-01/FE-01 — scoped mentor/docs statistics.
Все входят в contract/QA/E2E/integration gate V3-T01…T30. Существующие v3 задачи сохраняются.
Текущий demo runner принудительно mock; фактическая причина иных live fallback не исследована.
