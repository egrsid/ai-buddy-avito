# RP-CONTRACT-01 — текущая передача

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
исправлений, прежние StepActionList/optional-null/FE замечания остаются открытыми.

| ID | Автор | Фактическое состояние / остаток |
|---|---|---|
| RP-CONTRACT-TL-01 | TL | DONE: baseline/policy/ownership; дополнительные ответы на FE review зафиксированы |
| RP-CONTRACT-BE-01 | Backend | IN_PROGRESS: пять schemas/180 positive/34 invalid готовы; добавить StepActionList и optional-null negatives |
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
- [ ] BE добавил StepActionList={items:RecoveryAction[]} для GET step/actions и fixtures.
- [ ] BE добавил optional-null negatives; Go omitempty/Date header включены в implementation tests.
- [ ] FE обновил CLIENT_DISCONNECTED/ResourceAccess/Run refinements, parsing на всем общем наборе зеленый.
- [ ] BE и AI явно подтвердили scopes/structured/SSE/source/error границы; runtime race tests остаются их задачами.
- [ ] TL обновил BASELINE.sha256 после этой поставки и записал окончательное acceptance.
- [ ] Одна принятая база доставлена в рабочие папки авторами/владельцем, QA работа сохранена.

Никакой review не подразумевается отсутствием ответа. Изменение hash lock не является
approval. До final gate можно проектировать и готовить component tests; runtime общих
DTO не закрепляется на расходящихся копиях. Подробные решения уже даны, повторного
устного выбора provider/framework/архитектуры от TL команде не требуется.
