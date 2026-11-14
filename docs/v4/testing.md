# Приёмка v4

Это **план тестов, не результаты**. [Baseline v3](../v3/integration-acceptance-2026-11-14.md)
не доказывает новые v4 функции. [Delivery/gates](delivery.md).

| ID | Проверка / ожидаемый результат | Owner |
|---|---|---|
| V4-T01 | 0/1/N workspaces/unlinked items, все страницы, dedup shared goal, independent collapse/direct URLs | FE + BE |
| V4-T02 | Link preview/confirm: own pinned assignment и permitted template; foreign intern/team/resource/expired/hash/revision → deny, no state change | BE + QA |
| V4-T03 | Link/unlink/adopt/editor/Telegram не меняют evidence/verified; completed journey не клонируется; две оси и empty states понятны | BE + FE |
| V4-T04 | 390px/keyboard/focus/account switch/pending double click/reload; revoked link не выдаёт goal label/ID | FE + QA |
| V4-T05 | Submitted/approved/grant/check различимы; timeline совпадает с reducer, GET без side effects | BE + FE |
| V4-T06 | Duplicate/out-of-order/missing event/revoked evidence: dedup, current invalidation, honest missing history, stable cursor | BE + QA |
| V4-T07 | Foreign goal/mentor/docs-owner/direct URL/raw payload leak → deny; allowed snapshot только intersection ACL | BE + FE + QA |
| V4-T08 | Own report → safe bounded context → useful diff на accepted fields; clear text допускает no-op/questions | AI + BE + FE |
| V4-T09 | Prompt injection/PII/secret/foreign refs/HTML/oversized/malformed/schema output: provider input filtered и unsafe output rejected | AI + BE |
| V4-T10 | Missing deadline/result/criteria → needs_input; модель не выдумывает требования/системы/permissions | AI + QA |
| V4-T11 | Partial selection + exact preview + apply меняет draft; published/assignment/evidence intact; separate manual publish | BE + FE |
| V4-T12 | Parallel edit/publish/revoke/expired/apply replay/different body/late generation/discard/restart → safe conflict, no lost draft/double apply | BE + QA |
| V4-T13 | Provider timeout/budget/schema/unknown → explicit origin + manual editor; ≥24 new eval cases, all ≥10 safety served outputs safe | AI + FE |
| V4-T14 | Oracle A=10/6, B=10/2 → 60%,20%,−40pp; repeated same intern/last_seen не меняют numerator; denominator=eligible | BE + QA |
| V4-T15 | H=7d: t=start included, t=start+H excluded, immature/adopt/revoke/overlap intern excluded, unknown v3 history → no invented zero | BE + QA |
| V4-T16 | Version/section/reason/team/owner isolation и comparable confirmation; renamed/new semantic section → not_comparable | BE + QA |
| V4-T17 | Cohort<5, numerator/complement=1, suppressed side: counts/rates/delta/totals/exclusions do not reconstruct small cells | BE + QA + FE |
| V4-T18 | No exposure/denominator0/missing history/zero known numerator → разные состояния; as_of/timezone/policy/cursor stable | BE + FE |
| V4-T19 | Read/reload/revoke/cache/direct link do not leak metadata or mutate reports; comparison labels descriptive/synthetic, no causal ROI | BE + FE + QA |
| V4-T20 | New isolated dataset/ports/seed replay/clock provenance/restart, v3 DB/docs feedback/Telegram no-send regressions | TL + FE + QA |
| V4-T21 | Actual 10 primary runs through Go, real validated sources/origin/usage/latency; planned mock clearly separate | AI + BE + TL |
| V4-T22 | Secondary/offline/cooldown recovery, auth/model/429/timeout/budget/unknown usage/interrupt cases; no mixed partial or guard weakening | AI + BE |
| V4-T23 | ACL negative and injection in live rehearsal do not expose foreign title/ref/secret; manifest/logs contain no keys/chat/PII | AI + BE + QA |
| V4-T24 | Browser story workspace→proof→diff→publish→comparison; actual operations, screenshots, refresh/restart and manual usability notes | FE + TL |

## Уровни и evidence

Unit: metric arithmetic/window/privacy, proposal validation, UI states. Integration: real
PostgreSQL/runtime roles, migrations, Go↔AI structured validation, event/replay/concurrency.
Provider-input spy обязателен: проверка уже отфильтрованного ответа не доказывает pre-LLM ACL.
QA metric oracle вычисляется независимо от production aggregator и содержит expected
eligible/affected/exclusions/suppressed/rate values, не копирует его алгоритм.

Browser: реальные клики по Go API, нет перехвата бизнес responses для зелёного demo.
External Telegram navigation можно spy, без отправки. Fault harness локальный/test-only.
Synthetic cohorts подготовить через sanctioned harness/events; не править SQL вручную
на пользовательском dataset и не выдавать за прожитую неделю.

Component line coverage строго >80% отдельно Go/AI/mock/FE. Tests не заменяются schemas,
liveness/readiness и общим покрытием репозитория. Сохранить прежние negative ACL/budget,
confirm/approval/IAM/evidence/docs-loop tests, seed replay, real restart и migration checksum.

После runtime: `make check`, релевантные `scripts.check_components`, isolated Go/mock DB,
AI DB runner и `npm run test:e2e --prefix frontend` на чистом QA dataset. Точные новые
v4 runner CLI поставляет TL, не обещать несуществующий make v4-demo. Offline evals в CI
без paid ключа. Go race с C compiler, cold build и actual CI evidence — отдельные gates.

Actual live запускается только с разрешением владельца, validated config и существующим
persistent budget ledger. Отсутствие account/key/budget → V4-T21 OPEN, не PASS на mock.
На fault cases явно указать fake/actual; latency sample из 10 запросов не production p95.

## Gate документации этого прохода

Проверить local links, полноту 5×spec/design/tasks, owner/dependency ID consistency,
DAG, git diff --check и make check. Изменения только .md; executable schemas/seed/migrations/
config/код не тронуты; одна docs ветка, runtime/контейнеры v4 не запускаются.
Actual results текущего docs gate фиксируются в README после проверки.
