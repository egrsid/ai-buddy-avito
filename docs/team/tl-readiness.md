# TL readiness и решения по интеграции

## Дополнение планирования v3 · цели / live LLM / статистика

Прямое поручение владельца: в docs/v3-planning добавлены три SDD (spec/design/tasks),
задачи GOALS/LLM/STATS, расширены Product/architecture/contracts/handoffs/QA до V3-T30.
Текущий проход docs-only, код/JSON/SQL/seed/env/CI/Docker/БД не менялись.
Проверены исходники только read-only: scripts/demo.py задаёт mock и очищает API key,
compose.demo.yaml также mock. Это подтверждённый фактор offline запуска; остальные причины
live fallback пока не диагностированы. Paid calls не выполнялись, live gate не закрыт.
Статистика разделяет технические попытки и сообщения о неясности, считает Go с ACL до
aggregation; нет фиктивного исторического denominator. Goals progress — Go evidence.
Проверки документации: make check 57 PASS, ссылки/lint/format/schema/SQL/YAML PASS;
новые V3-T15…T30 — план, не отчёт о реализации. Демо main сохранено.


## Передача к v3 · 13 ноября · документация

Владелец опубликовал main b6f940d: [remote audit/CI/tree comparison](repository-audit-2026-11-13.md).
Ветка docs/v3-planning создана от main, только Markdown. [V3 пакет](../v3/README.md)
задаёт Telegram вместо внутреннего обращения, редактор версий ТЗ и независимый task clarity
feedback наставнику. Telegram выбран владельцем явно. V3-TL-01 готов на уровне docs;
code/schema/migration/runtime/acceptance v3 остаются TODO. Main/Docker/БД не менялись.
Старые handoff/specs помечены v2 baseline либо superseded, начальная очередь — delivery.md.
Документационная проверка: make check 57 PASS, docs links/schema/SQL/YAML/lint PASS.
V3 acceptance matrix — план; код и поведение этим проходом не тестировались/не менялись.


## Финальная локальная интеграция в main · 13 ноября

По прямому поручению владельца main fast-forward до TL b0e5529, затем в main перенесён
полный executable/config/UI snapshot проверенной AI worktree 9b54700 с pending guard.
Исходные AI/BE/QA/TL ветки и отдельная AI worktree сохранены. История оригинального AI
commit неполная, поэтому использован проверенный snapshot import, без фиктивного merge
ancestry. Происхождение отражено в integration-sources.json; TL records сохранены.
Новые локальные commits разрешены текущим поручением; push/PR не выполняются.

Главный build checkout — корень проекта, ветка main. `make main-demo` проверяет branch
и вызывает offline rebuild/up текущих исходников. UI/AI/business behavior совпадают
с финальной AI версией, дополнительных функциональных изменений нет. Пользовательская
БД не сбрасывается. Повторная проверка всех frontend/AI/backend/mock/contracts/data
файлов против проверенной AI worktree: полное совпадение. В main повторно выполнены:
make check 57 PASS; FE build/494 tests/94.78%; AI 457 PASS/99.75% (5 DB tests требуют
отдельного DB runner). Предыдущая full browser/DB приемка того же runtime сохраняется:
4/4 и 5/5; на текущей пользовательской БД выполняется только read-only session smoke.
Контейнеры пересоздаются из корневой папки main, volumes и текущий прогресс сохранены.


## Последняя сверка всех branches · RP-INTEGRATION-01 · 13 ноября

Сверены все шесть remote branches через GitHub connector. Owner сохранил прошлый UX
результат в d9792ce; рабочая папка была чистой. AI теперь 25ac58f, FE c814283;
BE ea2cfbe, QA f88228c и main 30c5d08 не изменились.
[Inventory](branches.md), [импорт по файлам](integration-sources.json).

Принят AI delta: first-fragment timeout <=6s отдельно от полного buffered ответа;
весь ответ до общего first-content deadline с резервом следующей модели, прежние
20/25/85/90s верхние лимиты. Circuit breaker 30s для упавшей модели и query embedding,
общий persistent budget guard, complete-paragraph offline answer без повторного mock
prefix, человекочитаемые названия действий в prompt/шаблоне. Request scope/ACL и
обязательный fallback notice/прямое обращение к наставнику сохранены.

FE c814283/AI cherry-pick 25ac58f: импортированы совместимые App/Step tests и fixtures
intern-b/c. Сохранены более полные TL sessionPending/sessionReady, встроенный step chat,
4 основных роли, Markdown и ACL document drawer. Отдельный /chat/goal/step не нужен.

**Не принят дублирующий Go syntheticKnowledge:** разные статические document body/title
при той же version=1 скрывают сбой индекса и расходятся с kb/source excerpt validation.
У текущего Go уже есть persistent AI knowledge; корректность индекса проверяется
readyz/DB integration. Go runtime, contracts, DB seed/migrations остаются прежними.

Автор AI приложил report-failover.md и report-live-failover.md: заявлены primary/secondary/
offline scenarios и 13/13 automated live cases (10/10 safety). Это **предъявленный
авторский отчет**, не повторный paid run TL и не окончательная ручная приемка качества.
В частности, live пример SSL содержит ошибочное предположение о недоступном режиме;
формальный проход ключевых слов не закрывает RP-AI-02/manual quality gate.

Дополнительно full browser v2 выявил race второго POST check с прежним expected_version:
FE recovery controls теперь disabled от начала POST до получения нового GET step.
Regression test проверяет запрет повторного клика/смены SSL/обращения и новый version
в следующем запросе. Go optimistic concurrency сохранена.

Host проверки новой сводки: AI 453 PASS/99.71% lines, FE build PASS,
484 PASS/94.62% lines, make check 57 PASS. Persistent kb/ACL на отдельной QA-базе:
5 PASS. Повторный browser на свежей ai-buddy-demo-latest-v3: **4 PASS, 19.3s**,
включая весь путь двух стажёров, source drawer, buddy, ACL, candidate review и настоящий
restart. Ошибка stale check не повторилась. Артефакты/логи сохранены в игнорируемом
`tmp/acceptance-latest/` до последующей read-only проверки основного стенда.
Основной проект ai-buddy-demo-local пересобран с сохранением своих volumes;
все 5 сервисов healthy, сайт http://localhost:15173. Read-only browser session/refresh
smoke PASS (1/1). Режим LLM=mock явно обозначен. Paid вызовов в этом проходе нет.


## Исправления по замечаниям владельца · 13 ноября · RP-DEMO-UX-01

В TL checkout выполнен локальный consumer/AI delta; BE/FE/QA/AI refs и source SHA
не менялись, commit/push/PR нет. Новые замечания заменяют прежнее решение показывать
семь аккаунтов сразу. Основные четыре роли сохранены для разделения полномочий;
второй стажёр и другая команда доступны через «Дополнительные участники».

| Зависимость | Согласованное поведение |
|---|---|
| Go Step → FE blocker | Кнопка recovery только при blocker.status=open и наличии действия одновременно в blocker.recovery_actions и step.available_actions. У resolved история без кнопок; серверный draft остаётся authoritative |
| Ошибка при stale UI | TOOL_VALIDATION_ERROR/VERSION_CONFLICT переведены в понятное предложение обновить состояние; серверная проверка не ослаблена |
| AI → Go messages → FE | Текст в прежнем string поле, заголовки/нумерованные шаги Markdown; live prompt получает точные разрешённые URL. Offline guidance называет кнопки и этапы по trusted context |
| Source → FE → Go knowledge | Кликабельные источники открывают drawer через повторный GET knowledge/ACL. Inline links разрешены только из citations; HTML/images/external links не исполняются |
| Role selector → Go login | Четыре основных аккаунта без role suffix; дополнительные включаются отдельно, серверные accounts/assignments/permissions не менялись |
| Ordered failover → readable answer | Локальный fallback сохраняет целые абзацы/ссылки в лимите сообщения и обязательное уведомление, без обрезанного Markdown |

Общие DTO, schemas, DB migrations, seed, permissions и Go runtime не менялись.
Инструкции получили широкую панель, заголовки, списки и code formatting, без повтора h1;
Markdown soft wraps не превращаются в случайные разрывы строк.

Проверки: FE build PASS, **482 tests / 94.50% lines**; AI **445 PASS / 99.61%**
(5 DB tests отдельно), **29/29 evals** внутри AI suite; `make check` **57 PASS**.
Реальный browser A/B/C/restart/ACL **4 PASS, 19.3s** на ai-buddy-demo-polish-v1;
добавлены открытия оформленной инструкции/ссылки из чата и отсутствие recovery после
verified. Persistent kb/ACL tests **5 PASS** на этой же отдельной QA-базе.
Скриншоты `frontend/test-results/` просмотрены: readable-instruction.png и intern-a-preview.png.
Paid live вызовы/качество нового prompt на реальной модели не проверялись.


## Повторная интеграция · готовность к локальному созвону · 13 ноября

**GO для локального offline demo.** Стандартный чистый стенд — http://localhost:15173,
проект ai-buddy-demo-local. Запуск на этой машине: `make demo-offline`.
Это реальные Go/AI/corporate/PostgreSQL и browser clicks, без fixture API/SQL-правок.
Синтетические проверки и offline AI обозначены; live API означает Go API, не платную LLM.

### Новая поставка и согласование

- Локальная база владельца: 61b6add, уже включает предыдущий TL/AI delta. Backend
  повторно проверен: ea2cfbe, новых commits нет. AI aa6ff38 и QA f88228c не менялись.
- Новая FE-поставка **1f96778b5da0f5d6d2194d3d79d6fd1a56fce224** добавила manual
  requestAccess/preview и SSL disable/require. Эти файлы и tests импортированы.
  Ее Makefile/README не заменяли TL: такой запуск обходил persistent ingest/readiness.
  Добавление wget в backend Dockerfile из FE не понадобилось: текущий wget healthcheck работает.
- По новому поручению TL/QA/AI выполнены необходимые consumer wiring fixes в TL:
  session readiness до mount live pages; auth/me при reload; все 7 demo accounts;
  goal/step chat поверх существующего LiveChatPage; refresh после action; полный
  диагностический preview. BE/FE/QA/AI refs не менялись; Go/mock business code не правился.
  Author snapshots и локальный delta отличимы в integration-sources.json.
- Manual requestAccess совместим с AI failover: degraded ответ не предлагает tool,
  но стажёр может явно нажать «Запросить доступ» и подтвердить серверный preview.
  Штатный offline AI выдаёт proposal в контекстном чате; этот путь показан E2E.

### Наблюдаемые результаты

| Проверка | Результат |
|---|---|
| `make check` | 57 PASS, lint/format/docs/schema/SQL/YAML |
| FE build/component | build PASS; **475 PASS, lines 94.34%**; исходники UI входят в denominator |
| Полный browser A/B/C + restart | **4 PASS, 19.4s**, включая неизменённые 2 QA API tests, без skip/interception |
| AI kb/pgvector/ACL | **5 PASS** под ai_service в отдельном test image, не skipped |
| V2 verify-db | PASS: identities, kb index и запреты cross-schema/DDL/DML |
| Остальные компоненты | Go source ea2cfbe: 80.98% lines; AI unchanged: 443 PASS/99.65%; mock unchanged: 98.05%, previous evidence ниже сохраняется |
| Offline image build | PASS: current sources COPY в новые images, без host bind mounts; uv --offline/Go GOPROXY=off; Python runtime --no-dev |

Команда browser приемки на свежем QA dataset:
`E2E_BASE_URL=http://localhost:15173 APP_ORIGIN=http://localhost:15173
PLAYWRIGHT_CHROMIUM_CHANNEL=chrome DEMO_PROJECT=ai-buddy-demo-release-v3
npx playwright test --workers=1` из frontend.
System Chrome использован с отдельным временным browser profile. В CI ставится Chromium.

Browser test реально выполнил AI draft → отсутствие заявки до confirm → submitted →
approver decision → отдельный IAM recheck → ssl=disable/DB_SSL_REQUIRED → повтор того же
intern без candidate → exact handoff → buddy reply без verified → ssl=require/100% →
intern-b/вторая ошибка → один candidate count=2 → under_review/accepted без изменения
документа → реальный restart → сохранение verified/review/session → intern-c/buddy-b ACL.
`frontend/test-results/` содержит screenshots preview/blocker/buddy/candidate,
`frontend/playwright-report/` — отчет. Оба пути намеренно в Git ignore.

Первый restart тест выявил гонку зависимости: параллельный restart Go/mock позволял
Go увидеть CHECK_UNAVAILABLE и инвалидировать IAM. `scripts.demo restart` теперь
останавливает Go, перезапускает AI/mock, ждёт health, затем поднимает Go. Последующий
прогон на новой БД прошел полностью; тест не ослаблялся и verified не выставлялся вручную.

### Окружение и передача

Docker Hub по-прежнему возвращает TLS timeout. Это решено для созвона отдельной
сборкой Dockerfile.demo-offline/compose.offline.yaml из уже имеющихся dependency images.
Все прикладные исходники копируются и пересобираются; временные /tmp overrides не нужны.
Полный cold build на машине без cache и remote GitHub CI еще не подтверждены.
Go race detector по-прежнему не выполнен локально (offline Go image без gcc).
Платные calls/live quality не выполнялись; прежний live report 3.5 safety 9/10 остается
отдельным RP-AI-02 gate и не выдается за проверенный live release.

QA dataset ai-buddy-demo-release-v3 сохранён и остановлен; основной стенд подготовлен
с чистой отдельной DB, без ранее созданных goals/requests/candidates. Старые volumes
не удалялись. Новых commits/push/PR/merge нет. User-visible продукт для local call готов;
это не приемка public hosting, всех fault matrices, PDF/video или платной LLM.


## Текущий результат · 2026-11-13

**К объединению для полного browser demo пока не готовы.** В TL checkout локально сведены
авторские BE/AI/FE/QA поставки, исправлены общие startup blockers и AI citations/failover.
Нет commit/push/PR/merge; ветка остаётся feature/team-start-foundation, чужие refs не менялись.
Разрешение пользователя этого прохода допускает TL и AI изменения. BE/FE/QA runtime/tests
импортированы без авторских правок; происхождение и исходные hashes — [manifest](integration-sources.json).
Предыдущие записи ниже исторические; они не описывают отсутствие нынешнего runtime.

### Проверенные источники

| Область | Source SHA | Поставка |
|---|---|---|
| TL base | c0659195c4879a6eedbf70014fb5a6879bb08e63 | Текущий локальный HEAD; дополнительно сохранены .gitattributes и record из remote f88441418932d4fa179b7503c55d1d521375c438 |
| Backend | ea2cfbe35abb027c921c7e38882f43469e0fdadc | Go auth/journey/checks/actions/approval/SSE/buddy/reverse; app/corporate migrations и v2 seed |
| AI | aa6ff38d6dbb77ec427991913152cd6b10e311bf | Persistent kb/ingest/readiness, live adapters/budget/hybrid retrieval, offline operations/evals |
| Frontend | 3ea1d019081e836b9628084183174740c7caa5d9 | Typed API/SSE и live pages; остаются demo blockers ниже |
| QA | f88228cb5b1d669f05958c706e2c236c8cc7834f | Два адаптированных API-теста и QA-план, сохранены без изменения |

Remote source прочитаны через GitHub connector. Git transport и codeload из локального
окружения недоступны (reset/TLS timeout); source snapshots скачаны по точным SHA.
Это импорт файлов в TL, а не Git merge или изменение AI/BE/FE/QA branches.

### Что исправлено в первую очередь

1. RP-INF-01/RP-DATA-TL-01: compose.mvp теперь выбирает v2 seed, реальный AI ingest,
   PYTHONPATH, persistent kb/readiness и настоящие DB tests с KB_INTEGRATION=1.
   Канонические argv получены из кода AI; Makefile/.env.example больше не требуют
   угадывать их. Новый compose.demo.yaml/scripts.demo запускает отдельный
   ai-buddy-demo-* с mock, 15173/18080, без чтения .env и удаления volumes.
2. Source consumer blocker: AI excerpt раньше нормализовал Markdown/whitespace и добавлял
   «…»; Go отвергал его как несуществующую цитату, завершал AI_SCHEMA_INVALID и не давал
   action. Теперь excerpt — буквальный span исходного документа. Добавлены regression
   tests всех corpus citations; индекс/embeddings/profile не меняются.
3. RP-AI-02: существующий OpenAI adapter и общий durable ledger переиспользованы для
   GigaChat/GigaChat-3-Pro → ai-sage/GigaChat3.5-432B-A28B → deterministic offline.
   «GigaChat3.5Pro» не подтвержденный ID; точный Pro ID уже есть в AI smoke/report.
   LLM_MODEL задаёт primary, LLM_FALLBACK_MODEL — secondary, отдельные цены обязательны.
   Даже без secondary single-model OpenAI режим имеет offline recovery.
4. Каждая live попытка буферизуется до успешного конца и ограничена 6s (либо меньшим
   оставшимся budget); максимум две. Это дополнительный demo cap, исходные 20/25/85/90s
   не увеличены. Ошибочный/оборванный текст не сохраняется как completed instruction.
   На degraded пути нет tool.proposed; штатный mock по-прежнему поддерживает drafts.
   EOF без [DONE] больше не считается успехом, cancellation не запускает fallback,
   budget refusal сразу выбирает offline, неизвестный usage оставляет резервы.
5. В message.delta всегда добавляется: «Произошла ошибка обращения к LLM. Работает fallback.
   Обратись к своему наставнику напрямую для решения вопроса». Offline явно помечен.
   Сообщение проходит существующий Go SSE/history без изменения публичных схем.
6. v2-aware verify-db больше не ищет legacy app.tasks после v2 seed/AI ingest.
   CI получил отдельную DB для Go/mock и v2 Compose/API/AI DB stages; запуск CI ещё не предъявлен.

### Фактическая проверка и ограничения

- make check: PASS, 56 shared tests; contract fixtures 11/11, FE typed/fixture/component
  suite 467/467, frontend build PASS, coverage 94.47%. Lock обновлён после технической
  проверки общего snapshot; это не замена отсутствующего явного BE↔AI consumer approval.
- AI component после финальных правок: **443 passed, 5 DB tests skipped, 99.65%**. Отдельные реальные kb/pgvector tests **5/5 PASS**
  под ai_service, не skipped. Offline evals **29/29**, safety **18/18**.
- Go точный source собран в локальном Go 1.27.3 build image, go vet PASS; tests PASS,
  statement 81.1%, принятая line metric **1490/1840 = 80.98%**. Runtime binary совпал
  с rebuild по SHA-256 b872497833cd33504f3903d2d89b54beced7066671b6425178cc1c072f7fa6f2.
  Race не запускался: host Go отсутствует, offline Alpine build image без gcc.
- Corporate mock: **6/6 PASS**, **98.05%** под mock_service с отдельной
  buddy_test_tl_20261113. Сначала default check не имел DSN, затем read-only test image
  не мог записать coverage; повтор с настоящей test DB и /tmp coverage прошёл.
- Настоящий Go→AI→corporate→PostgreSQL API путь **PASS**: draft/SSE/message/sources и
  pending preview до confirm → submitted → scoped approval → IAM recheck → DB_SSL_REQUIRED →
  exact buddy snapshot/reply → ssl=require/verified → второй distinct intern →
  один affected_count=2 candidate → under_review/accepted. Browser этим не заменён.
  Команда: AI_ACCEPTANCE=1 BACKEND_ACCEPTANCE_URL=http://localhost:18080
  APP_ORIGIN=http://localhost:15173 uv run --frozen python -m scripts.backend_acceptance.
  Только для свежего отдельного dataset; повтор на уже пройденных целях не является clean demo.
- QA: E2E_BASE_URL=http://localhost:15173 APP_ORIGIN=http://localhost:15173
  npx playwright test e2e/onboarding.spec.ts — **2 PASS**, настоящий API, без interception.
- Fault acceptance: отдельный внутренний HTTP stub вернул 503 обеим моделям. Настоящий
  Go сохранил completed fallback message с уведомлением/советом наставника и без actions.
  Затем Backend реально пересоздан с обычным offline AI: тот же message content и
  первоначальная verified Goal сохранились. Это local fake API, без paid/live вызовов.
- Migrate/seed/ingest повторены без сброса demo прогресса. V2 verify-db/role isolation PASS.
  Host make test остановился на отсутствии go; это не green полного make test.
- Чистый Compose build BLOCKED внешней сетью: Docker Hub TLS handshake timeout для
  python:3.12-slim/node:26.13.0-alpine/alpine:3.22. Репетиция реально запущена на уже
  имеющихся images с read-only mounts нынешнего source и совпадающим Go binary.
  Она не доказывает clean production image build. Cached override и evidence:
  /tmp/ai-buddy-audit; основной проект ai-buddy-demo-20261113, сайт http://localhost:15173.
  Временные fault-сервисы остановлены. Старые volumes не удалялись.

### Остаток до созвона — в таком порядке

| Приоритет / владелец | Блокер и наблюдаемая приемка |
|---|---|
| 1 / Frontend RP-FE-02 | Live login race: POST login 200, первые GET goals 401; после «Повторить» GET 200. Ждать session перед mount/fetch и восстанавливать auth/me после reload; не возвращать fixtures как реальный результат |
| 2 / Frontend RP-FE-02 | Нет create_access_request в LiveStepPage и контекстного live чата шага. Общий LiveChatPage создаёт goal_id/step_id=null, поэтому не может предложить goal-bound заявку. Нужны реальные draft/preview/confirm кликами |
| 3 / Frontend RP-FE-02 | LiveStepPage всегда посылает ssl_mode=require. Нужны disable → видимый DB_SSL_REQUIRED → buddy → require → trusted success; нельзя подменять это fixture |
| 4 / Frontend RP-FE-03 | Selector показывает только intern-a/buddy-a/approver-a/docs-owner-a; нет intern-b и intern-c. Нужен второй intern для count=2 и отрицательная команда C, серверные сессии/ACL обязательны |
| 5 / Frontend RP-E2E-01 | Полный browser A/B/C без route interception, reload/restart, source drawer и реальные permissions. Нынешние 2 QA API tests не закрывают этот gate |
| 6 / TL RP-INF-01 | Повтор clean image build/up с доступным registry, CI run, race на Go toolchain с gcc; команда demo-up готова, но сетевой отказ не объявлен исправленным |
| 7 / AI RP-AI-02 | Текущий Pro report 12/13, safety 10/10, один timeout; 3.5 report 12/13, safety 9/10 (unknown term). Tighten prompt и повторить live safety обоих моделей; failover/цены/доступ проверить с реальным account отдельно. В этом проходе paid calls нет |
| 8 / TL + consumers | Явный общий consumer acceptance, чистая пятиминутная browser репетиция и актуальные demo/materials. RP-INTEGRATION/RP-DEMO не DONE |

Разрешенные изменения этого прохода выполнены в TL checkout и AI modules. FE/BE/QA
компонентные исходники не исправлялись за авторов. Временный team checklist сохраняется:
его условия удаления и окончательная приемка ещё не выполнены.


---

## Исторические записи до текущего прохода


2026-11-12. Владелец поручил выполнить TL-часть в `feature/team-start-foundation`.
Дедлайн владельца: **2026-11-12 22:00 Europe/Moscow**. Это срок, не утверждение готовности.
Ни чужие ветки, ни refs, ни remote не изменены. Новая ветка не потребовалась; commit/push/PR нет.

**Повторный review после AI push:** текущая TL база уже fe870967 (прежние изменения
зафиксированы владельцем до этого прохода); новая AI поставка 3f955322 — семь commits.
[Актуальный review](ai-review-2026-11-12.md): 184 tests/99.90%, evals 29/29; runtime
не импортирован в TL. Ниже проверки bootstrap относятся к прежнему проходу; AI теперь
имеет offline HTTP/SSE/ACL/diagnostics в своей ветке, но остается без persistent kb,
ingest/DB tests/readiness и с открытыми AI-R2/R3/R4. Текущие правки — только документация.

## Проверенная поставка и происхождение

| Пакет | Проверенный commit GitHub | Что включено в TL checkout |
|---|---|---|
| Backend | 69fea38237068149a7aa07c840f98e1b280d5ca9 | Пять v2 schemas, examples/invalid, общий validator/tests; contract validation в check_repo |
| AI contracts | 0da47f66a30c3a5aad94ee0fe50a2bb059431e8d | ai.schema.json, AI examples/invalid и девять contract tests; не изменились в новой поставке |
| AI runtime | 3f955322eabd2874d5952e160ce1cf5c3898cb0d | Только read-only review/изолированные tests; не импортирован в TL checkout |
| Frontend | 676b81dd0cb1636a3b578459cd6404298f769335 | Изучен review/код; frontend в TL checkout не копируется и не исправляется за автора |
| QA | 1d47f6b2d58ded0eacd8e7588270b009663c9388 | Изучены legacy tests; QA-файлы не перезаписываются |

JSON-файлы BE/AI импортированы без изменения. `contracts/v2/BASELINE.sha256` фиксирует
состав и SHA-256 каждого JSON. `python -m scripts.contract_baseline` проверяет смешение
версий; `--write` обновляет lock после согласованной поставки, но не заменяет review.
Legacy v1 остается отдельным проверяемым пакетом, не runtime-совместимостью v2.

## Решения TL по frontend review 3.1–3.9

1. Расширенные BE fixtures принимаются для технической проверки. FE должен повторить
   consumer test на этой версии: в аудите 4/181 failures, не условное молчаливое approval.
2. Принимаются уточнения BE: cancelled без error_code; interrupted только с
   STREAM_NOT_OPENED/CLIENT_DISCONNECTED; completed с assistant_message_id. Пустого
   assistant Message нет; до первого токена остается только терминальный Run.
3. ResourceAccess до проверки: unknown, stale=true, observed_at отсутствует. После
   наблюдения время обязательно. Закрытый/неизвестный ресурс дает одинаковый 404.
4. Error.fields.name в P0 остается **верхнеуровневым именем поля**. Для вложенной ошибки
   options.ssl_mode передается name=options и safe code; dotted paths не добавляем.
5. Все list API возвращают {items:[...]}; GoalList содержит полные Goal со steps в P0.
6. Для GET /goals/{id}/steps/{step_id}/actions выбран {items: RecoveryAction[]} — тот же
   вычисленный allowlist, что Step.available_actions, без второго источника состояния.
   **Backend добавляет StepActionList/schema/example/invalid, FE binding.** До этой поставки
   endpoint не считается покрытым контрактом; TL не меняет авторскую schema за Backend.
7. Optional означает absent, не null. Nullable исключения: User.buddy_id и общий
   Conversation.goal_id/step_id. Backend добавляет negative fixtures для optional null,
   FE повторяет parsing. Go использует omitempty там, где null запрещен.
8. Три mandatory steps и blocker-context handoff — осознанные P0-ограничения. FE
   показывает Action.preview, а не самостоятельно собирает parameters в preview.
9. TTL вычисляет Go. Ответы создания/чтения Action имеют HTTP Date (серверное UTC-время).
   UI оценивает remaining от Date и времени получения; created_at не является текущими
   часами. Таймер UI справочный, право confirm окончательно проверяет сервер.

Это решения TL в ответ на конкретные вопросы потребителя. Авторы подтверждают их
соответствующими schemas/tests и записанным review, а не новым устным согласованием.
RP-CONTRACT-REVIEW-01: **IN_PROGRESS**. Техническая проверка предъявленных BE+AI schemas
выполнена, но final acceptance зависит от п. 6–7 и повторного FE/BE↔AI review.
Нельзя отмечать parent DONE до этих результатов. До gate доступны проектирование и
подготовка component tests; общие runtime DTO закрепляются после consumer acceptance.

## Реализованная TL инфраструктура

- Python production image включает contracts/ для offline refs; отдельный test target
  содержит dev dependencies. Непривилегированный app имеет writable coverage directories.
- compose.mvp.yaml — явный target overlay. Ingest ждет seed, AI ждет ingest и /readyz;
  отдельный ai-db-tests получает только ai_service DSN, mock LLM и пустой LLM_API_KEY.
- AI сам поставляет две команды как JSON argv arrays: AI_INGEST_COMMAND и
  AI_DB_TEST_COMMAND. scripts.ai_tasks запускает их без shell, сохраняет nonzero exit,
  запрещает admin DSN и unsafe fault config. Нет фиктивного ingest/test по умолчанию.
- make mvp-preflight/mvp-up/ai-db-test и opt-in workflow_dispatch mvp_acceptance
  подключены. Отсутствующие компоненты/CLI дают BLOCKED/nonzero; это не green MVP.
- CI compose проверяет v2 schemas в непривилегированном test image. Настоящий AI DB job
  включается явно после поставки команд/реализации, через repository vars с JSON argv.
- Общие seed/migrate/check reads и hashes используют explicit UTF-8; regression tests
  проверяют кириллицу/emoji/hash и неизменность migration checksum. Applied 001 не менялись.
- verify-db проверяет наличие seed IDs без требования, чтобы в БД было ровно 4 аккаунта;
  дополнительные записи не требуют reset. Сам seed/DDL остается legacy до поставки BE/AI.
- BACKEND_PORT/FRONTEND_PORT позволяют поднять отдельное окружение без захвата 8080/5173.

Общие manifests/locks не менялись: запроса минимальных production deps от AI пока нет.
После поставки v2 seed/table layout нужны точная адаптация seed/check/verify-db и реальный
повторный прогон; нельзя объявить RP-DATA-TL-01 завершенной на v1.

## Проверки и ограничения

Фактические проверки TL: clean bootstrap Compose в отдельном проекте
`ai-buddy-tl-20261111`, новые volume/network, порты 18080/15173; повтор migrate/seed дважды;
verify-db (seed IDs/role isolation); liveness smoke. Всё успешно на **legacy dataset**.
11 v2 contract tests прошли внутри собранного test image под app, без LLM/сети во время tests.
Локальный make check: 50 tests passed, lint/format/docs/schema checks passed.
make test на хосте остановился на отсутствии go; backend vet/build успешно выполнены отдельно
закрепленным Go 1.27.3 container (read-only source). AI/mock component checks — BOOTSTRAP,
не business coverage. Frontend TL checkout — bootstrap build, не remote FE prototype.
После настоящего restart PostgreSQL/backend verify-db снова прошел; это legacy persistence.

Это не новая auth/journey/IAM реализация, не full P0 E2E и не offline AI evaluation.
Прежние FE findings: build/171 tests pass, coverage 48.09%; текущие BE fixtures дают FE
4/181 failures. Чужие ветки не исправлялись, результаты не выдаются за актуальный FE pass.
MVP preflight ожидаемо BLOCKED: runtime v2/migrations/CLI/browser tests еще отсутствуют.

## Что не может быть принято без чужой поставки

| TL задача | Реальное состояние / необходимый вход |
|---|---|
| RP-CONTRACT-REVIEW-01 | TL решения/проверка готовы; нужны schema additions и consumer acknowledgements |
| RP-INF-01 | Bootstrap/image/config проверены; AI HTTP уже поставлен, но target ждет AI-R1: kb/ingest/readiness/DB tests |
| RP-DATA-TL-01 | UTF-8/runner foundation проверены; v2 seed/schema layout/IDs еще нужны от BE/AI |
| RP-INTEGRATION-01 | AI unit/coverage/evals проверены, AI-R1–R4 открыты; нужны BE/FE runtime и общий API/browser/security/restart отчет |
| RP-DEMO-01 | Нужен принятый работающий путь для честной репетиции/видео/PDF |
| RP-TL-02 | Срок 12 ноября 22:00 подтвержден владельцем; оригиналы требований/формат сдачи отсутствуют |

До получения оригиналов внутренний release gate — Product Spec/SDD/testing strategy:
offline local P0, четыре прикладные роли, >80% каждого компонента, A/B/C и negative tests.
Соответствие неизвестным правилам организаторов не утверждается. Ключ/бюджет обязательному
offline P0 не нужен; public hosting/второй journey/P1/P2 не добавляются в дедлайн.
Live LLM/embeddings RP-AI-02 уточнены последним поручением ниже как отдельная MVP-поставка
AI Engineer; их готовность не выводится из offline gate.
Публикация/доставка локального результата в рабочие ветки еще не выполнялась; чужие ветки
обновляет их автор/владелец по Git-контракту. Перед обновлением сверить текущие heads.

Изолированный проект после проверки остановлен командой compose down **без --volumes**;
его ai-buddy-tl-20261111_pgdata сохранен. Docker Desktop остается запущенным. Контейнеры
и volumes других проектов не менялись.


## Ответ на три вопроса AI Engineer о стратегии · 2026-11-12 · предыдущий проход

Локальное TL-решение по сообщению владельца; только документация в текущей ветке.

1. [AI Engineering Strategy](../AI_ENGINEERING_STRATEGY.md) приведена к
   [Product Spec](../product/specification.md): S3 — синтетическая тестовая БД,
   `DB_SSL_REQUIRED`, отдельные confirm/approval/grant recheck и trusted DB check.
   Отсутствующая AVITO_AI_BUDDY_PRODUCT_SPEC.md больше не является источником требований.
2. В scope, примеры, план и DoD стратегии добавлено обязательное продолжение:
   friction → два distinct intern → один Knowledge Gap Candidate → scoped human review.
   AI предлагает безопасную гипотезу; Go хранит/дедуплицирует/ведёт review, accepted не publish.
3. Cloud.ru остаётся подключением внутри OpenAI-совместимого адаптера openai после проверки
   AI Engineer; смена архитектуры не требуется. **AI Engineer сам ищет/получает ключ и
   model access, готовит окружение самой LLM и подключает провайдера.** Он передаёт ETA,
   блокеры, env/deps и фактические расходы. Уточнено следующим поручением владельца:
   расходы и вся LLM-specific интеграция переданы AI Engineer без approval TL; бюджет
   1000/stop 800 ₽. RP-AI-02 — live-поставка MVP отдельно от обязательного offline P0.
   Фактические ключ/пополнение счёта/live-готовность не подтверждены.

Продуктовая спецификация и Reverse Onboarding SDD уже содержали нужный P0 и не переписаны.
Код/контракты/DDL/seed/конфигурация не менялись. AI-R1–R4, FE/BE/QA/contract/integration
конфликты этой задачей не исправлялись и их приёмка не закрыта. Чужие ветки/refs не менялись;
commit/push/PR/merge/checkout не выполнялись. Исследовательские цены/модели не проверялись:
их проверка относится к AI Engineer в RP-AI-02, не к этой продуктовой правке.

Проверка этой правки: `UV_CACHE_DIR=/tmp/ai-buddy-uv-cache make check` — успешно,
**50 passed**, docs links/v1/v2/schema/SQL/YAML/lint/format пройдены.
`git diff --check` — успешно; изменены только 10 Markdown-файлов, refs/ветка сохранены.
Component/E2E/live API tests не запускались: код и поведение не менялись.


## Решение по предложениям AI Engineer: модель/бюджет/cache · 2026-11-12

[AI strategy](../AI_ENGINEERING_STRATEGY.md), policy/design, SDD, ownership/backlog,
operations и testing согласованы в текущей ветке; это требования, не runtime-поставка.

- Исправлено имя: `ai-sage/GigaChat3.5-432B-A28B` — официальный ID без `-Reasoning`.
  Предположение о скрытых reasoning-токенах/множителе 2–5 не относится автоматически к нему.
  Тариф каталога 96,22/288,60 ₽ даёт 0,77934 ₽ за 6000/700 tokens; вместимость бюджета
  теоретическая, actual usage/billing/TTFT проверяет AI Engineer.
- Бюджет 1000 ₽, начальный stop 800 ₽/резерв 200 ₽; AI обеспечивает расходы и всю
  LLM-specific интеграцию самостоятельно, без подтверждения TL. Общая offline/DB infra — TL.
- Limiter принят с reserve-before-call, atomic/durable ledger, shared lock/persistent volume,
  cap и tests concurrency/restart/retry/unknown usage. Это больше, чем log-cost counter;
  stop → LLM_UNAVAILABLE и явный offline retry. Реализация AI Engineer ещё требуется.
- 20/25/85/90s неизменны, первые 5–10 замеров входят в ~10 smoke; Ollama опциональна.
  Reasoning diagnostics/GigaChat-3-Pro auto routing не добавлены.
- QA cache опционален после guard/safety, только stateless documentation answers;
  subject/full scope/revisions/model/prompt/schema/question и ACL revalidation на hit.
  Dynamic/actions/diagnostics/candidates исключены, live eval cache-off.
- Live embeddings — Cloud.ru BAAI/bge-m3 одним разрешённым key и единым index/query profile;
  несовместимая смена provider/profile → reindex. Generation/key смена сама по себе — нет.
  A-Vibe после MVP; Сбер freemium — резерв без нового адаптера; условия/оплату своего
  Cloud.ru аккаунта проверяет AI Engineer, регистрация/покупка здесь не выполнялись.

S1–S4, DB_SSL_REQUIRED, evidence/approval/feedback/privacy сохранены. AI-R1–R4 и прочие
component/integration findings не закрыты. Новых документов, кода/схем/config/DDL нет;
чужие ветки/refs, commit/push/PR не затрагиваются. Проверки этого прохода — ниже.

Проверки текущего прохода: `UV_CACHE_DIR=/tmp/ai-buddy-uv-cache make check` — успешно,
**50 passed**, lint/format/docs/schema/SQL/YAML пройдены. `git diff --check` — успешно.
Дополнительно сверены 21 раздел стратегии, S1–S4/security/модель/budget policy и отсутствие
старых TL approval gates. По хэшам изменены только 16 существующих Markdown-файлов;
исполняемые файлы/config/contracts/DDL, Git refs/ветка и untracked inventory неизменны.
Новых документов/коммитов нет, live API/оплата/регистрация/component/E2E не выполнялись;
это не подтверждение реализации guard/cache или расхода средств.

## Локальная проверка bootstrap и QA API · 2026-11-13

- На Windows `core.autocrlf=true` переводил `scripts/bootstrap-db.sh` в CRLF. Хотя Dockerfile
  копировал файл с правом 755, Linux не мог разрешить `#!/bin/sh\r` и PostgreSQL выходил 127.
  В TL checkout добавлено правило `.gitattributes` `scripts/bootstrap-db.sh text eol=lf`;
  рабочий файл нормализован к LF.
- Собранный PostgreSQL image проверен на одноразовом контейнере без постоянного volume:
  bootstrap создал роли/схемы/extension, `pg_isready` вернул accepting connections.
- Для интеграционного запуска использована временная Compose override с Postgres build context
  из TL checkout и отдельный project `ai-buddy-api-test` с новой v2 БД. Все сервисы healthy;
  повторный `migrate` прошёл дважды, `seed` прошёл дважды без сброса прогресса, liveness
  smoke backend/frontend/AI/mock прошёл. Повторный `npx playwright test e2e/onboarding.spec.ts
  --reporter=line` против v2 API: **2 passed**. Это только два RP-QA-01 API сценария,
  не browser E2E/полный P0/restart.
- `verify-db` запущен, но падает на legacy ожидании `app.tasks`: активный v2 seed не содержит
  legacy task IDs, а `kb`-данные принадлежат AI. Это несоответствие verifier текущему v2 seed,
  не подтверждённый дефект сервиса. Отдельный read-only запрос подтвердил отсутствие SELECT
  через `app_service` в corporate/kb, `ai_service` в app/corporate и `mock_service` в app/kb;
  полного role-isolation сценария с запретами DDL/DML эта проверка не заменяет.
- `make check` остановился на contract snapshot guard: требуется consumer review и обновление
  TL lock. Lock намеренно не перегенерировался, поскольку RP-CONTRACT-REVIEW-01 еще IN_PROGRESS.
  Отдельные `ruff check`, `ruff format --check` и `pytest tests -q` прошли ранее: 50 tests.
- Исходный упавший проект `ai-buddy` и его частично инициализированный volume не удалялись.
  Исправление и отчет зафиксированы локальным коммитом в `feature/team-start-foundation`; push не выполнялся.
  RP-INF-01 остаётся IN_PROGRESS до v2-aware `verify-db`, CI acceptance и финальной проверки.
- `git diff --check` прошёл для TL-изменений.
