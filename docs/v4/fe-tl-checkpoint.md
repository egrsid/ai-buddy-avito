# FE + TL v4 · checkpoint 14 ноября 2026

Поручение владельца: выполнить FE/TL и поднять независимое component line coverage до
**≥82%**. Старое docs-only ограничение снято для этого поручения. Изменения только в
feature/frontend-v4 и feature/tl-v4; BE/AI/QA branches и их runtime не менялись.

## Источники

Planning base 9a0d95f (содержит v3 f4f63a0). Git fetch выполнен: в origin есть planning
и v3 branches, BE/AI v4 и executable contracts/v4 отсутствуют. FE commits:
8055c9b, c576daa и 171cd5c. TL branch включает их fast-forward и добавляет общие проверки.
Ни push/PR/remote merge. Чужие БД не сбрасывались; component tests использовали
buddy_test_v3_final на отдельном PostgreSQL QA.

## Статусы задач

| Задача | Состояние | Что поставлено / что осталось |
|---|---|---|
| V4-CONTRACT-FE-01 | BLOCKED на поставке BE/AI | Presentation models/tests и consumer handoff готовы; final DTO parsing по executable BE/AI fixtures отсутствует до их поставки |
| V4-CONTRACT-01 (TL) | BLOCKED | Инвентаризация/hash/schema check готова; G1 lock/review нельзя получить без schemas/потребителей |
| V4-WORK-FE-01 | PARTIAL | Независимые карточки/две оси/empty/revoked/focus/collapse; нет live projection/link preview-confirm без WORK-BE |
| V4-PROOF-FE-01 | PARTIAL | Current state/trusted source/invalidated/missing history; нет Go timeline/cursor/re-authorization |
| V4-EDIT-FE-01 | PARTIAL | Diff/selected apply/TTL/pending/error/manual message/needs_input; нет accepted proposal/apply API и настоящего draft/publish integration |
| V4-IMPACT-FE-01 | PARTIAL | Server-provided aggregate rendering, pp/no-data/suppression/synthetic limits; нет real exposure/config/impact API |
| V4-E2E-FE-01 | PARTIAL | Prototype browser/mobile/keyboard/no-v4-write PASS; full-stack story ждёт BE/AI |
| V4-DEMO-TL-01 | PARTIAL | Read-only artifact manifest и существующая isolated v3 orchestration; event/test-clock v4 harness ждёт DATA-BE-01 |
| V4-INTEGRATION-01 | BLOCKED | 82% gates и baseline checks PASS, v4 G2–G5 не выполнены |
| V4-LIVE-AI-01 review TL | OPEN | Владелец выбрал offline; новых paid calls и actual-live acceptance нет |

Компонентные prototypes не называются реализацией server ACL/экспозиций/обновления БД.
Отсутствующие зависимости не реализованы за Backend или AI Engineer.

## Поставки FE

[Consumer handoff](frontend-handoff.md). В `frontend/src/v4/` отдельные presentation
модели и компоненты. Они не являются утверждённым external API. `/v4-preview` доступен
по явной ссылке в sidebar. Экран содержит только подписанные synthetic примеры и
не вызывает v4 endpoints. Apply/discard в prototype показывают отсутствие сохранения,
не изображают successful publication. Обычные v3 экраны сохранены.

Прототип доступен на http://localhost:15176/#/v4-preview во время запущенного Vite.
Воспроизведение:

```sh
VITE_DATA_MODE=fixtures npm run dev --prefix frontend -- --port 15176
E2E_BASE_URL=http://localhost:15176 PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:e2e --prefix frontend -- v4-browser-preview
```

Для полного v4 E2E нужен отдельный synthetic runtime dataset после G1/G2, не замена
бизнес API фикстурами. Browser preview проверяет отображение и действия UI, не server ACL.

## Поставки TL

- `scripts.coverage_policy`: точное целочисленное сравнение covered/total ≥82%, без
  округления/агрегации между компонентами; пустой denominator не PASS.
- `scripts.check_components`: Go line gate≥82, Python --cov-fail-under=82 для AI/mock;
  FE vitest threshold82. Глобальный Python coverage fail_under82 также задан.
  В CI существующие component jobs вызывают этот runner, threshold наследуется.
- `scripts.v4_readiness`: инвентаризация трёх предложенных v4 schemas, hash, syntax/schema
  validity и safe code revision. Не читает env/keys и не делает network/provider/DB calls.
  Exit2 — missing/invalid, exit0 — present_not_accepted. Ни один exit не означает G1 approval.
  Dataset/provider execution неизвестны или false, не заполняются вымышленными данными.

```sh
uv run --frozen python -m scripts.v4_readiness --output /tmp/v4-readiness-manifest.json
```

На текущей базе ожидается exit2 с тремя missing schemas. Это реальный блокер, а не
падающий unit test. BE/AI могут согласовать другие имена в G1; REQUIRED и consumer handoff
обновляет TL после решения, не принимает guessed DTO за общий контракт.

## Проверки

- Frontend build PASS; 609 unit/component tests PASS, coverage 95.91% lines.
  Новые v4 presentation components: 100% lines, 97.46% statements, 93% branches.
- Browser prototype: 1 PASS, keyboard/mobile и отсутствие v4 mutations.
- Новые TL tooling tests: 14 PASS, 98% coverage (оставшаяся строка — CLI entrypoint).
- AI baseline: 489 PASS, 5 DB tests skipped в unit suite; 97.58% coverage ≥82.
- Mock baseline на isolated test DB: 6 PASS, 98.05% coverage ≥82.
- Go baseline: vet/tests PASS; lines 2282/2742 = 83.22% ≥82. Это обычный Go test,
  race detector в текущем cached image без C compiler не выполнялся.
- Shared make check PASS: 117 tests, docs links/contracts/SQL/YAML/lint/format; git diff --check PASS.

Проверки baseline v3 не закрывают новые v4 runtime gates. Cold build/remote CI, actual
provider latency/usage, live failure recovery и новые DB migrations остаются OPEN.

## Дальнейшая передача

BE/AI предъявляют contracts/v4, fixtures и review → FE адаптирует parsing, TL фиксирует
G1 lock → DATA/workspace/timeline/proposal/impact endpoints → FE wiring → реальный
isolated E2E, persistence/ACL/replay/clock provenance → TL G4-offline.
Только после отдельного решения владельца возможен actual-live gate. Имена/сроки людей
не придуманы. План v4 остаётся обязательным; текущий checkpoint честно частичный.
