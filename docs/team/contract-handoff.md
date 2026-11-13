# RP-CONTRACT-01 — текущая передача

Дополнение RP-DEMO-UX-01: FE recovery теперь требует open blocker и актуальный
Step.available_actions; resolved карточки не отправляют недопустимые draft.
Source открывается из чата повторным Go GET knowledge с ACL. AI string допускает
форматированный Markdown, inline URL активен только при совпадении с validated Source.
Новых shared полей, schema/DDL и объединения server roles нет. Матрица и проверка:
[TL record](tl-readiness.md). Formal approval ниже остаётся отдельным gate.

13 ноября: актуальные BE public schemas (StepActionList/null negatives) импортированы,
11 shared contract tests и весь FE suite 467 PASS. TL lock обновлен, настоящий
Go→AI generate/source/action путь PASS после исправления AI excerpts. Явный BE↔AI/
final consumer approval еще не получен: parent остается IN_PROGRESS.
Источники и техническая приемка — [TL record](tl-readiness.md).
Прежние failure counts ниже относятся к 12 ноября.


2026-11-12. Parent **IN_PROGRESS**. [TL integration record](tl-readiness.md) содержит
source SHA, checksum lock, решения по всем замечаниям FE и реальные результаты проверки.
Схемы BE/AI уже предъявлены и сведены локально в TL; это не поставка runtime и не final acceptance.

Обновление: AI отдельно поставил runtime 3f955322; schema JSON в семи новых commits
не менялись. [Повторный review](ai-review-2026-11-12.md): 184 AI tests проходят также
на TL schemas; это техническая проверка, не BE↔AI approval. AI-R2/R3 требуют runtime
исправлений. StepActionList и optional-null negatives добавлены Backend; повторный FE review ещё открыт.

| ID | Автор | Фактическое состояние / остаток |
|---|---|---|
| RP-CONTRACT-TL-01 | TL | DONE: baseline/policy/ownership; дополнительные ответы на FE review зафиксированы |
| RP-CONTRACT-BE-01 | Backend | IN_PROGRESS: schemas, all-state fixtures, StepActionList и optional-null negatives готовы; final TL acceptance ещё нет |
| RP-CONTRACT-AI-01 | AI Engineer | IN_PROGRESS: AI schema/47 positive/42 invalid готовы; подтвердить boundary с Backend на общем snapshot |
| RP-CONTRACT-FE-01 | Frontend | IN_PROGRESS: review/bindings предъявлены; последняя BE версия дает 4/181 failures, нужен повторный review |
| RP-CONTRACT-REVIEW-01 | TL | IN_PROGRESS: общий offline/schema image check пройден; финал после consumer исправлений/подтверждений |

## Единственные авторы

Backend: common/public/journey/events/corporate schemas, их examples, invalid/backend.json,
 tests/contract_v2_support.py и tests/test_contracts_v2_backend.py. AI: ai.schema.json,
examples/ai.json, invalid/ai.json, tests/test_contracts_v2_ai.py. Frontend: typed bindings,
consumer tests/review. TL: общий lock/check tooling, решения, review record и интеграция.
Common определения и helper не дублируются. `$id`/`$ref` разрешаются локально.

## Что нужно перед final gate

- [x] TL policy и source revisions записаны; все существующие BE+AI fixtures валидны.
- [x] Schemas доступны непривилегированному app в собранном test image; 11 tests pass.
- [x] TL ответил на FE 3.1–3.9; см. tl-readiness.md и api-contracts.md.
- [x] BE добавил StepActionList={items:RecoveryAction[]} для GET step/actions и fixtures.
- [x] BE добавил optional-null negatives. Go omitempty и HTTP Date остаются на runtime-тестах RP-AUTH-01/RP-ACCESS-01, не на JSON Schema.
- [ ] FE обновил CLIENT_DISCONNECTED/ResourceAccess/Run refinements, parsing на всем общем наборе зеленый.
- [x] Backend подтвердил по `contracts/v2/ai.schema.json`: AccessScope, Source, State и ErrorCode определены только в common; GenerateRequest, tool.proposed, generation.completed, draft/handoff/candidate и internal Error ссылаются на них. Source.url остаётся `/api/v2/knowledge/{id}`. Подтверждение AI и runtime race tests ещё открыты.
- [x] Backend принимает семь document UUID версии 1 из AI review для будущего seed и не вводит второй набор: connection A `0000000a-0000-4000-8000-00000000000a`, request A `0000000b-0000-4000-8000-00000000000b`, public `0000000c-0000-4000-8000-00000000000c`, team B `0000000d-0000-4000-8000-00000000000d`, restricted `0000000e-0000-4000-8000-00000000000e`, private `0000000f-0000-4000-8000-00000000000f`, injection `00000010-0000-4000-8000-000000000010`. Старый intern-b из seed v1 не переназначается этим файлом.
- [ ] TL обновил BASELINE.sha256 после этой поставки и записал окончательное acceptance.
- [ ] Одна принятая база доставлена в рабочие папки авторами/владельцем, QA работа сохранена.

## Ответы Backend на frontend review `RP-CONTRACT-FE-01`, пункты 3.2–3.4

- `Run.status=cancelled` не содержит `error_code`: это явная отмена.
- `Run.status=interrupted` всегда содержит `error_code`: `STREAM_NOT_OPENED`, если поток не открылся, или `CLIENT_DISCONNECTED` после обрыва или рестарта.
- `Message.content` не бывает пустым. Если токенов не было, Go не создаёт assistant Message, и у Run нет `assistant_message_id`. У `completed` ссылка на такое сообщение обязательна. Частичный ответ — непустой текст со статусом `interrupted`, `failed` или `cancelled`.
- `GET /resources/{id}/access` до первой проверки видимого ресурса возвращает `grant_state: unknown`, `stale: true` и не содержит `observed_at`. После любой проверки `observed_at` обязателен. Чужой или неизвестный ресурс по-прежнему даёт 404.

Fixtures всех этих состояний лежат в `contracts/v2/examples/public.json` и `contracts/v2/examples/common.json`. Пункты 3.5–3.9 в эту поставку не входят.

Никакой review не подразумевается отсутствием ответа. Изменение hash lock не является
approval. До final gate можно проектировать и готовить component tests; runtime общих
DTO не закрепляется на расходящихся копиях. Подробные решения уже даны, повторного
устного выбора provider/framework/архитектуры от TL команде не требуется.
