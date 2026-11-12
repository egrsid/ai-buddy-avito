# RP-CONTRACT-FE-01 — Frontend consumer review контрактов v2

**Дата:** 2026-11-11
**Ревьюер:** Frontend
**Объект:** `contracts/v2/common.schema.json`, `public.schema.json` (+ examples `common.json`, `public.json`, invalid `backend.json`) из ветки `origin/feature/backend-mvp-v2`
**Область review:** public DTO, SSE payloads, errors, states, nullability, empty data — употребимость для UI. Journey/events/corporate просмотрены поверхностно; их consumer — Backend/TL.

## 1. Метод проверки

1. Прочитаны TL baseline, api-contracts.md, state-machines.md, event-contracts.md, security-правила.
2. Официальный offline-валидатор Backend: `uv run --frozen pytest tests/test_contracts_v2_backend.py` — **2 passed**.
3. Написаны typed-биндинги потребителя (zod, строгое зеркало схем: `.strict()`, условные required/forbidden по статусам) — черновик `frontend/src/contracts/{common,public}.ts` + тест `contracts.test.ts`.
4. Typed-парсинг всех fixtures: **122 проверки, все пройдены**:
   - 47/47 позитивных examples common — парсятся;
   - 52/52 позитивных examples public — парсятся;
   - 22/22 invalid-кейса, адресованных common/public (из 28 в `invalid/backend.json`; остальные 6 — events/journey/corporate, зона BE/TL), — отклоняются (в т.ч. forbidden actor/role/buddy/state в ActionDraft, SQL/DSN в options, null в user_claim, half-context conversation, both-fields RunCreateRequest).

## 2. Общая оценка

Схемы **употребимы для frontend**: закрытые объекты, полные enums, условные поля по статусам (Check/Action/Escalation/Candidate/Run) читаются однозначно, null и отсутствие разведены осознанно (`buddy_id` — explicit nullable; `run_id`/`assistant_message_id`/`error_code` — optional-absent), Source.url каноничен, UUID pattern фиксирует v4 — fixtures ему соответствуют. Блокеров для принятия baseline нет; замечания ниже — уточнения и пробелы в fixtures, которые нужны FE для RP-FE-01 (all states UI).

## 3. Замечания

### 3.1 (главное) Fixtures покрывают не все состояния — нужны для all-states UI

Каждое определение имеет ровно один позитивный пример, в основном happy path. Для верстки и тестов всех состояний (требование RP-FE-01 и UI_GUIDELINES) прошу добавить fixtures:

- **Goal/Step:** статусы `ready`, `waiting_external`, `unverified`; Step с открытым blocker и `evidence[].invalidated_at`; Step с `user_claim`; **пустые списки** (`GoalList.items: []`, пустые `evidence`/`blockers` — empty state UI).
- **Check:** `queued`, `running`, `passed`, `unavailable` (сейчас есть только `failed`).
- **Run:** `failed` + `error_code`, `cancelled`, `interrupted`, `completed` + `assistant_message_id`.
- **Action:** `executing`, `succeeded` (+`result`), `failed`/`unknown` (+`error_code`), `expired`, `cancelled` (сейчас только `pending_confirmation`).
- **AccessRequest:** `approved`/`rejected`, `grant_state: pending/present/unknown`, `sync_status: unavailable`.
- **Escalation:** `resolved` (+`answer`, `resolved_at`).
- **Candidate:** все `state` включая `resolved` + `resolved_reference`; `enrichment_status: pending/failed`.
- **Error:** per-code примеры для кодов, которые FE обязан отрисовывать: `VERSION_CONFLICT`, `ACTION_EXPIRED`, `ACTION_NOT_PENDING`, `RUN_ACTIVE`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `UPSTREAM_TIMEOUT`, `AI_SCHEMA_INVALID`, `FORBIDDEN`, `NOT_FOUND`, `CSRF_INVALID`, `ROLE_NOT_REQUESTABLE`, `TEMPLATE_INVALID`. Сейчас 4 примера Error покрывают в основном internal pipeline (`UNAUTHENTICATED`, `INVALID_REQUEST_ID`, `INVALID_JSON`, `VALIDATION_ERROR`).
- **ResourceAccess:** `stale: true`, варианты `grant_state`.

### 3.2 Run.error_code для `cancelled`/`interrupted` не определён

Условия схемы: `failed` — error_code обязателен; `queued/running/completed` — запрещён. Для `cancelled`/`interrupted` поле опционально без правила: FE не может понять, рендерить ли пояснение ошибки. Прошу явное правило (запретить либо задокументировать семантику, например `STREAM_NOT_OPENED` при interrupted).

### 3.3 Message.content `minLength: 1` против частичного/пустого ответа

state-machines требует сохранять частичный assistant-ответ с терминальным статусом. Если run упал до первого токена, пустое assistant-сообщение схемой не представимо. Нужен документированный ответ: либо Go не сохраняет пустые assistant-сообщения (тогда FE опирается только на Run), либо `content` должен допускать пустую строку для не-completed статусов.

### 3.4 ResourceAccess.observed_at обязателен, но «ещё ни разу не проверялось» не покрыто

`GET /resources/{id}/access` до первой IAM-проверки: 404, или `grant_state: absent` с каким `observed_at`? Прошу задокументировать поведение и дать fixture.

### 3.5 ErrorBody.fields: имя поля без вложенности

Формат `fields: [{name, code}]` удобен, но `name` — StableId без точек: вложенные пути вида `options.ssl_mode` непредставимы. Если Go будет возвращать ошибки по вложенным полям — расширить pattern либо зафиксировать flat-именование.

### 3.6 Несоответствие doc ↔ schema по спискам

api-contracts.md для `GET /journeys` пишет «JourneySummary[]», тогда как общее правило и схема (`JourneyList`) — `{items:[...]}`. Прошу привести таблицу маршрутов к единому виду `{items}` (затронуты также `GET /goals` → `GoalList`, `GET /goals/{id}` → Goal). Уточнить также, что элементы GoalList — полные Goal со steps (для list-эндпоинта тяжеловато, но в P0 приемлемо — подтвердить).

### 3.7 Нет DTO для `GET /goals/{id}/steps/{step_id}/actions`

Текст API: «только допустимые descriptors действий» — но определения дескриптора в public.schema.json нет (в Step есть только `available_actions: RecoveryAction[]`). Нужен `StepActionDescriptor` + fixture, либо явное указание, что эндпоинт дублирует `Step.available_actions`.

### 3.8 Optional-поля: null vs absent на стороне Go

Схемы требуют отсутствия поля, а не `null` (напр. `Run.assistant_message_id`, `Message.run_id`). Go-сериализация с `omitempty` это обеспечит, но явный `null` — классический источник интеграционного слома. Прошу добавить invalid-кейсы (`assistant_message_id: null` должен отклоняться) и подтверждение в contract-handoff.

### 3.9 Мелочи для awareness (не блокеры)

- `Goal.steps` жёстко = 3 (minItems=maxItems=3) — соответствует baseline P0; FE может на это опереться, но второй маршрут (P1) потребует изменения схемы. Задокументировать как P0-ограничение.
- `DiagnosticSnapshot.blocker` обязателен → эскалация возможна только из контекста blocker. Подтверждаю как намеренное; UI покажет кнопку эскалации только на blocked-шагах.
- `Action` дублирует snapshot в `parameters` и `preview` (escalate_to_buddy) — FE рендерит только preview; приемлемо.
- `expires_at` по серверным часам: для обратного отсчёта TTL FE нужен ориентир серверного времени (предлагаю считать от `created_at`/`updated_at` ответа, а не от клиентских часов) — достаточно строки в api-contracts.md.
- `CandidateReviewRequest.decision: under_review` — это переход «взять в работу», не финальное решение; учтено в экранах docs-owner.

## 4. Что проверено и признано рабочим

- Строгое закрытие объектов: unknown properties отклоняются (invalid-кейсы это подтверждают и на zod-стороне).
- Условные required/forbidden по статусам Check/Action/Escalation/Candidate/Run корректно воспроизводятся typed-биндингами; fixtures им соответствуют.
- Source.url pattern совпадает с каноническим правилом (`/api/v2/knowledge/{uuid-v4}`); внешний URL отклоняется (invalid `common-external-url`).
- Запрет actor/role/buddy/state во входных draft (invalid `public-forbidden-*`) — ключевое для FE правило «клиент не задаёт права» работает.
- StableId/UUID/Timestamp/PositiveInt консистентны во всех public DTO; fixtures v4-UUID.

## 5. Артефакты проверки

- Typed-биндинги (черновик для будущего `frontend/src/contracts/`): `common.ts`, `public.ts`, тест `contracts.test.ts` — 122 зелёных проверки (`npx vitest run src/contracts/contracts.test.ts`).
- Официальный валидатор: `tests/test_contracts_v2_backend.py` — 2 passed.

## 6. Итог

**Замечаний-блокеров нет; baseline со стороны FE принимается условно** — при условии, что п. 3.1 (fixtures всех состояний) и ответы на вопросы 3.2–3.4 попадут в финальный TL review до старта RP-FE-01. Остальные пункты — уточнения документации/дополнительные invalid-кейсы, не останавливающие проектирование UI.

---

## 7. Повторный FE review (2026-11-12, после поставки BE StepActionList + optional-null negatives)

Проведён consumer re-check на обновлённом наборе Backend (требование TL, tl-readiness п. 1 и 6–7).

**Результат: 188 проверок контрактов зелёные (`src/contracts/contracts.test.ts`), всего 368 тестов FE.**

- **3.1 fixtures всех состояний** — принято ранее; новая версия набора по-прежнему парсится typed-биндингами без исключений.
- **3.6 list-формат** — подтверждено решением TL п. 5: все list API `{items:[...]}`, GoalList содержит полные Goal со steps в P0. FE рассчитывает на это в экранах целей.
- **3.7 StepActionList** — закрыт поставкой BE: схема, example (`items: [retry_check, create_access_request]`) и invalid (`public-step-actions-unknown`, `grant_admin` отклоняется по enum). FE-биндинг добавлен: `StepActionList = { items: RecoveryAction[] }`, strict, maxItems 3, uniqueItems. Замечание снято.
- **3.8 optional null** — negative fixtures Backend отклоняются typed-биндингами (absent, не null; исключения `User.buddy_id` и `Conversation.goal_id/step_id` — nullable по решению TL п. 7). Замечание снято; финальная проверка `omitempty` — на runtime-тестах Backend (RP-AUTH-01/RP-ACCESS-01), не на JSON Schema.
- **3.5 fields.name** — принято решение TL п. 4 (верхнеуровневое имя поля, без dotted paths). FE показывает safe code, не сырой путь.
- **3.9 TTL** — принято решение TL п. 9: серверное время из HTTP Date, таймер UI справочный, право confirm проверяет сервер. FE при интеграции (RP-FE-02) не будет полагаться на клиентские часы.

**Итог повторного review: открытых замечаний со стороны FE нет.** Со стороны FE условия для RP-CONTRACT-REVIEW-01 выполнены; финальное acceptance — за TL (обновление BASELINE.sha256 и запись acceptance в contract-handoff).
