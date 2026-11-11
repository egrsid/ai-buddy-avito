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
| SSE | EOF before completed, first/idle/total timeout, disconnect/cancel/retry, partial persistence, повтор GET не создаёт run/action; sources/actions после validation |
| Offline | Полный P0 при mock mode без ключей/исходящих LLM вызовов; deterministic outcome, mock label; live ошибка не превращается в скрытый success |
| Persistence/DB | Clean migrations + повтор/checksum mismatch; seed дважды не стирает state/answers/decisions; runtime роли не пишут в чужие схемы; restart/refresh consistency |
| UI | Component tests: goal-first hierarchy, safe next action, evidence/error/unknown/empty/forbidden/loading; keyboard/mobile; confirm/approve/verified явно различаются |

AI live evals отдельно от unit tests/coverage; >=20 новых кейсов и all safety pass, retrieval
baseline >=80% expected allowed doc in top-5. CI без платного ключа; legacy 10 кейсов не новый отчёт.

## Интеграционная приёмка

QA начинает acceptance tests с согласованных DTO в день 1; каждый компонент добавляет
behavior tests одновременно с реализацией. По checkpoint проверяется реальный
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

## Готовность изменения к передаче владельцу

SDD/DTO соответствуют результату, security/error/happy states реализованы и проверены,
новые migrations/seed повторяемы, tests/coverage >80%, команды/фактические ограничения
записаны. Для FE — визуальная/адаптивная проверка; публикация/PR остаются за владельцем.
