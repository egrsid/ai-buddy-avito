# Проверки и Definition of Done — target v2

Версия 2.0 · 2026-11-11. [Product DoD](../product/specification.md),
[demo](../product/demo.md), [SDD](../features/README.md) — критерии нового MVP.
Сейчас только каркас: тесты старых контрактов не подтверждают готовность новых сценариев.

## Команды и честный статус

`make check` проверяет local docs links, legacy JSON Schema/examples/seed, SQL syntax,
Compose YAML, Python lint/format и shared tests. `make test` дополнительно запускает
component checks. `make smoke` — liveness, `make verify-db` — seed/DB-role isolation,
не journey/evidence/feedback E2E. Playwright skeleton — не реализованные E2E.
RP-CONTRACT-01/RP-DATA-01/RP-MOCK-01 обновляют исполняемые fixtures/checks по новому target.

Компоненты отдельно из корня:

```sh
uv run --frozen python -m scripts.check_components backend
uv run --frozen python -m scripts.check_components ai
uv run --frozen python -m scripts.check_components mock
uv run --frozen python -m scripts.check_components frontend
```

После реализации E2E — из frontend `npx playwright install chromium`, `npm run test:e2e`.
Checks запускаются только с доступными инструментами/зависимостями; недоступные проверки
указываются явно, без утверждения успеха. Контейнеры/reset этой docs-only задачей не запускаются.

## CI и покрытие

Обязательные jobs сохраняются: contracts, python, frontend, backend, compose. Прикладное
line coverage **строго >80% отдельно** для Go, AI, mock и frontend. Python fail-under=80.01,
frontend threshold=80.01; Go runner сравнивает точное отношение >80%, не округлённое >=80%.
Тесты/сгенерированный код/сторонние библиотеки исключены, handlers/use cases/validation — включены.
Go entrypoint main исключает только wiring; логика в internal/. Python logic вне main.py,
frontend feature/components вне main.tsx. Нельзя исключать бизнес-код ради порога.

Go стандартно также выводит statement coverage; line metric — union строк ненулевых
statement blocks coverprofile, строка покрыта только если исполнены все её blocks;
end position column=1 не включает последнюю строку. Метод закреплён scripts/go_coverage.py
и tests, трактовку организаторов сверяет RP-TL-02. Примерно/округлённые 80.0% недостаточны.
Отчёты сохраняются CI artifacts; допустимость агрегации уточняет TL, пока действует
более строгая независимая проверка компонентов.

До бизнес-модуля runner явно печатает BOOTSTRAP и проверяет build/compilation без coverage.
Это не 100% MVP. С первой фичи порог/тесты обязательны; отсутствие тестов не делает check зелёным.

## Матрица P0

| Область | Обязательные проверки и уровень |
|---|---|
| Auth | Unit/integration: cookie absent/expired/revoked, role/assignment из БД, Origin/CSRF/login/logout |
| Authorization | Go/AI integration: owner/team/resource/document ACL, ограниченная роль, self-approval запрещён, закрытые UUID одинаково 404 |
| Secure RAG | Provider-input spy: чужие chunks/title/metadata/PII не поступают LLM; output/citation/drawer повторная ACL, revoked scope/cache, injection не меняет rights/tools |
| Live budget, RP-AI-02 | AI tests с fake provider/usage: reserve до call, порог 800 при общем 1000 ₽, parallel/retry/embedding calls, restart/persist, duplicate settle, missing/corrupt ledger, timeout/cancel/unknown usage; hard output cap, stop LLM_UNAVAILABLE без вызова API |
| QA response cache (опционально) | Subject/full scope/policy/index/source/model/prompt/schema revision isolation; revoke на hit запрещает старый текст; dynamic/actions/diagnostics/candidates/partial/errors не кэшируются, live eval cache-off |
| Embedding profile | Cloud.ru BAAI/bge-m3: index/query provider/model/revision/dimension/preprocessing совпадают; mismatch not ready, смена profile — atomic reindex/cache invalidation, generation/key смена не заставляет reindex |
| Journey | Template unit: duplicate/missing IDs, cyclic/unknown dependencies, unknown method/action, refs/version/permissions; один valid JSON, immutable goal version |
| Goal/Step | Unit/integration: unverified/ready/blocked/waiting_external/verified, dependencies, прогресс, no manual done/AI verified, evidence invalidation, optimistic conflict |
| Access draft | Schema/AI eval: недостающие поля, лишний actor/role/resource, разрешённая requested_role, exact immutable preview |
| Confirm/action | Integration: без confirm нет write; expired/edited/foreign snapshot, concurrent confirm, same-key replay/conflict, TTL, crash-after-create/restart reconcile |
| Approval/grant | Role-scoped mock/Go integration: отдельно approve/reject, intern confirm/timer не одобряют; approved без grant/сбой grant не verified; IAM recheck |
| DB verification | Mock/Go: allowlist options, no SQL/DSN/host, ssl disable → DB_SSL_REQUIRED, require+grant → passed; failed/unavailable не успех |
| Event/evidence | Unit/integration: trusted adapter/correlation/subject/resource/goal/step/version, duplicate/out-of-order/stale event, revoke invalidates downstream, atomic app commit |
| Blocker/friction | Error normalization, safe context, instruction/version/attempt, dedup; unavailable не дефект документации; reply не technical resolution |
| Buddy | Exact preview/intersection ACL, отсутствие secrets/PII/full chat; чужой buddy 404, assignment changed, atomic reply+resolved, idempotent repeat; no auto KB |
| Reverse Onboarding | Один intern/много попыток не порог; два distinct intern одной группы → один candidate; concurrent threshold/replay count; разные step/code/journey не смешиваются |
| Candidate/review | Scoped owner, обезличенные fields/count/refs, AI invalid/unavailable fallback, state/version checks; accepted не publishes, resolved требует human-reviewed reference |
| SSE | Python provider 20/25s + pipeline 85s, Go run 90s; ping 10s на обоих участках не content; EOF/timeout/cancel races дают один terminal result; sources/actions после validation |
| Offline | Полный P0 без ключа/сети; default faults выключены; X-Mock-Scenario только authenticated local/test harness, public injection не работает; fault outcome отдельно от fake-clock tests |
| Persistence/DB | Clean migrations + повтор/checksum mismatch; seed дважды не стирает state/answers/decisions; runtime роли не пишут в чужие схемы; restart/refresh consistency |
| UI | Component tests: goal-first hierarchy, safe next action, evidence/error/unknown/empty/forbidden/loading; keyboard/mobile; confirm/approve/verified явно различаются |

AI live evals отдельно от unit tests/coverage; >=20 новых кейсов и all safety pass, retrieval
baseline >=80% expected allowed doc in top-5. CI без платного ключа; legacy 10 кейсов не новый отчёт.
Live smoke выбранной ai-sage/GigaChat3.5-432B-A28B: первые 5–10 замеров входят в примерно
10 вызовов, usage/cost сверены с биллингом, TTFT/timeout и полная latency записаны; 20s
first content, 25s idle, 85s pipeline/90s Go не продлеваются. Это не устойчивый p95 и не
доказательство offline gate. Guard/cache tests входят в обычный CI с fake provider, без
платных вызовов/Ollama. Live/embedding tests запускает AI Engineer явно в пределах
1000/stop 800 ₽; расходы и LLM-specific test wiring — AI Engineer, без approval TL.
[План/источники](../AI_ENGINEERING_STRATEGY.md). A-Vibe/прямой Сбер не требуются для MVP.
AI Engineer делает deterministic assertions и ручное чтение всех ответов набора; платный
LLM judge не обязателен. Backend проверяет safety/tool boundary, TL принимает отчёт.

## Дополнительная приёмка AI boundary и инфраструктуры

[AI integration policy](../architecture/ai-integration-policy.md) фиксирует решения TL.
Backend/AI tests проверяют 401 до stream, 400 INVALID_REQUEST_ID при отсутствии/невалидном/
multiple header, 400 INVALID_JSON, 422 VALIDATION_ERROR; общий Error и response request ID.
После начала SSE — run.failed, не второй HTTP JSON response. Heartbeat не сбрасывает
provider first/content timers и overall deadline; duplicate terminal/cancel/timeout не
создают второй result/action. Невалидный Source.url/ID/ACL не публикуется.

Python CI job: fake-storage/provider unit tests, без обязательного PostgreSQL. Дополнительный
compose CI runner запускает настоящие AI DB/pgvector/ACL integration tests после migrate/
seed/mock ingest, без paid LLM. Tests поставляет AI Engineer, runner/test image/wiring — TL.
Runtime role ограничена kb, production image не получает dev dependencies ради tests.
Проверять чтение реально скопированных v2 schemas в image, повтор ingest, index readiness,
explicit UTF-8 non-ASCII roundtrip/hash. До поставки runner эти проверки не считаются CI pass.
Конкретные команды tests/CLI поступают от AI, smoke/verify-db не заменяют запуск tests.

## Ответственность за проверки

| Проверки | Ответственный | Объём |
|---|---|---|
| Go/auth/policy/action/evidence/reducer/feedback | Backend | Component и API integration tests, все error/RBAC/idempotency cases и >80% coverage |
| Corporate mock IAM/approval/DB checks | Backend | Persistent mock contracts/states и собственное >80% coverage |
| AI/retrieval/privacy/schema/structured outputs/evals | AI Engineer | Provider-input spy, mock/live distinction, все safety cases, AI >80% |
| UI/components/typed parsing | Frontend | All states/mobile/keyboard и frontend >80% |
| Полный browser A/B/C E2E | Frontend, RP-E2E-01 | Реальные клики/confirm/approve/recheck/owner review; reload, restart совместно с TL |
| Только два стартовых API smoke | Fullstack–QA–Integration, RP-QA-01 | Adapt legacy goal ownership/reread и 401/CSRF; без всего feedback E2E и infra |
| Compose/DB scripts/CI/общий restart/offline/checkpoint | TL | Настоящий сквозной прогон, component reports и воспроизводимое demo |

В existing remote feature/qa-01-m1 уже есть frontend/e2e/onboarding.spec.ts и QA-план;
[ветки](../team/branches.md) фиксирует их содержимое/ограничения. Fullstack редактирует
эти два файла в своей ветке после обновления базы владельцем. Frontend использует другие
browser spec-файлы, не перезаписывает работу QA. Coverage/полная negative матрица остаются
у авторов компонентов; отсутствие Fullstack в их строке не исключает эти проверки.

## Интеграционная приёмка

Frontend начинает план browser acceptance tests с согласованных DTO; каждый компонент
добавляет behavior/security tests одновременно с реализацией. Fullstack адаптирует только
два существующих API smoke, общую интеграционную приёмку ведёт TL. По checkpoint проверяется реальный
Go/AI(mock)/corporate/PostgreSQL путь без перехвата бизнес-API и прямых SQL-правок.
Test-only управление временем/отказами разрешено для negative tests, не скрытое продвижение demo.

День 2: разрешённый journey/IAM; день 3: confirm/approval/grant; день 4: connection/error/
evidence/buddy/recheck; день 5: второй intern/candidate/owner; день 6: полный E2E/security/
offline/coverage. Demo A/B/C и отказы из [сценария](../product/demo.md) обязательны.

## Документационная задача RP-DOC-01

Проверить связи Product/Architecture/SDD/backlog/API/events и все требования brief;
make check; git diff --check; local Markdown links, ID задач и полноту восьми spec/design/tasks.
Сверить, что затронуты только .md, текущая ветка не менялась, JSON/SQL/code/seed/runtime
knowledge/config не изменены. Не добавлять поведенческие тесты без изменения поведения.
Продуктовые component/E2E/Compose не считать выполненными в этой задаче.

## Документационное назначение RP-TEAM-01

Проверить наличие пяти role handoff, единственного bounded ID у Fullstack, соответствие
owners во всех SDD/операционных документах и отсутствие циклов зависимостей. Проверить,
что фактическая QA-ветка/работа сохранена, proposed ветки явно помечены не созданными.
TL baseline DONE не закрывает parent RP-CONTRACT-01 и не подменяет review/schema implementation.
Команды: make check, git diff --check, проверка локальных ссылок/ID/tasks и неизменности
HEAD/refs. Только Markdown; no commit/push/checkout/merge/изменение чужих веток.

## Готовность изменения к передаче владельцу

SDD/DTO соответствуют результату, security/error/happy states реализованы и проверены,
новые migrations/seed повторяемы, tests/coverage >80%, команды/фактические ограничения
записаны. Для FE — визуальная/адаптивная проверка; публикация/PR остаются за владельцем.

## Текущий TL integration gate · 2026-11-12

[TL record](../team/tl-readiness.md) фиксирует import BE+AI snapshot и source SHA.
make check теперь проверяет hash lock, v1 отдельно, v2 BE/AI fixtures и regression tests
общих runners. Это не auth/ACL/timeout/feedback behavior acceptance. Test image дополнительно
запускает 11 v2 contract tests от app; production dev deps не получает.

make mvp-preflight завершается nonzero на bootstrap. Структурный успех preflight тоже
не доказывает P0: после него обязательны make test, AI DB runner, настоящий browser A/B/C,
negative ACL/provider-input spy, offline и restart. Target CI job включается явно после
CLI/runtime поставок, поэтому skipped/not run job не является acceptance.

AI tasks получают JSON argv (без shell), только runtime DSN; tests проверяют unsafe
fault config, отсутствие admin credentials, сохранение nonzero exit и порядок seed/ingest.
UTF-8 regression проверяет кириллицу/emoji/hash независимо от default locale.
Legacy startup/migrate/seed/isolation/liveness проверены в новом отдельном volume;
существующие данные не сбрасывались. Final FE >80%, typed retest и P0 evidence еще нужны.
