# V3 — приёмка и демонстрация

План, не выполненные тесты. CI и Docker v2 не доказывают реализацию v3.
Code coverage строго >80% на компонент; make check и component checks после реализации.

| ID | Проверка | Ответственный |
|---|---|---|
| V3-T01 | Назначенный Telegram контакт, t.me-only, invalid/missing username, no app/browser Telegram, clipboard denied | FE + BE |
| V3-T02 | Ни click, ни copy, ни текст «написал» не создают Escalation/Reply, delivery/verified/waiting_external | BE + FE + QA |
| V3-T03 | Preview/export: contact/assignment/ACL revoke, expired/hash mismatch; нет PII/raw chat/secrets/закрытых refs в clipboard или URL | BE + AI + QA |
| V3-T04 | Наставник создаёт draft, редактирует sections/criteria, публикует, назначает; чужие owner/team/intern запрещены | BE + FE |
| V3-T05 | Published immutable; optimistic conflict; old assignment pinned; explicit adopt, no automatic evidence/permission changes | BE + FE |
| V3-T06 | Один intern × N → нет отчёта; второй distinct same group → один; concurrent/replay не дублируют | BE + QA |
| V3-T07 | Version/section/reason/owner/team isolation, 30-day boundary, window спад/terminal report не переоткрываются | BE + QA |
| V3-T08 | DB_SSL_REQUIRED и CHECK_UNAVAILABLE не порождают обвинение наставника; docs flow и task flow независимы | BE + AI |
| V3-T09 | Наставник видит safe aggregate только своего ТЗ; иной buddy/docs-owner не читает; никакого списка стажёров/рейтинга | BE + AI + FE |
| V3-T10 | AI timeout/invalid output → та же deterministic report, preserved count/version; no publish/verified/tool side effects | AI + BE |
| V3-T11 | accepted не редактирует ТЗ; resolved только с опубликованным successor; автор вручную публикует и связывает | BE + FE |
| V3-T12 | Old pending/unknown escalation migration, immutable history ACL, отсутствие v3 inbox/send UI, restart без потери данных | BE + TL + QA |
| V3-T13 | Полный браузерный путь Telegram-preview → две неясности → report → editor → successor, reload/restart и old assignment | FE + QA + TL |
| V3-T14 | Прежний DB access/confirm/approval/IAM/check/docs-owner loop, live/offline labels и budget guard | Все компоненты |

Telegram URL/clipboard можно проверить browser spy без исходящего сообщения/бота; результат
формулировать как открытие ссылки и копирование, а не доставку. Использовать synthetic
контакт; проверять href и перехватывать только внешнюю Telegram navigation, без сети
к реальному адресату (бизнес API Go при этом не подменять). Не отправлять сообщение человеку при автоматических тестах.
Основной demo v2 и его БД не менять для приёмки; отдельный QA dataset v3.

## Demo после gate

Автор публикует ТЗ v1 с двумя стабильными разделами. Первый стажёр отмечает неясный критерий,
видит preview, копирует и открывает Telegram. Не отправлять сообщение реальному человеку.
Повтор одного не увеличивает порог. Второй отмечает тот же раздел: report count=2.
Наставник открывает гипотезу, редактирует критерий в новом draft, публикует v2, связывает
resolved reference. Показать прежнее назначение на v1, explicit adopt v2 и отсутствие
автоматического verified. Затем отдельно показать существующий documentation candidate.

## Дополнительная приёмка — цели, live LLM и статистика

Это TODO проверки будущей реализации, в текущем docs-проходе не выполняются.

| ID | Проверка и ожидаемый результат | Ответственный |
|---|---|---|
| V3-T15 | 0/1/несколько целей, paging: каждая цель отдельная карточка/свой progress; нет потери goals после первой | FE + BE |
| V3-T16 | Expand/collapse независимо, Enter/Space/aria-expanded, mobile, refresh/poll/возврат к шагу; при смене пользователя expansion сброшен | FE |
| V3-T17 | Progress только trusted Go: 0 steps=0, optional не mandatory, claim/Telegram/LLM не verified, invalidated evidence уменьшает процент | BE + FE |
| V3-T18 | Lazy/detail error, stale version, foreign goal ACL и total/title leaks, состояние pending не даёт повторный POST | BE + FE + QA |
| V3-T19 | Effective offline/live profile: demo runner mock/key-empty выявлены; live не наследует overlay, неправильный config fail before paid call | AI + TL |
| V3-T20 | Healthy endpoint: 10 последовательных primary live ответов с разрешёнными sources; фактический provider/correlation/usage и latency evidence, без offline текста | AI + BE |
| V3-T21 | Основная до первого content недоступна → secondary; обе отказали → offline notice + Telegram; cooldown recovery → primary | AI |
| V3-T22 | Budget denied/unknown usage, auth/model/429/timeout/empty/schema/source failure различимы; guard/deadlines не ослаблены, частичный текст не смешан с другой моделью/proposal | AI + BE |
| V3-T23 | Origin/reason/status одинаковы SSE/history/REST после reload/restart; UI не принимает слова модели «я ИИ» за доверенный origin | AI + BE + FE |
| V3-T24 | Cancel/disconnect/interrupted, ledger restart; в logs/operator telemetry нет key/chat/PII; CI без paid provider, live smoke отдельно в рамках бюджета | AI + TL + QA |
| V3-T25 | Фиксированный dataset: distinct users/accepted observations/attempts/open blockers и related reports дают точные ожидаемые числа по каждому source kind | BE + QA |
| V3-T26 | Duplicate/retry/out-of-order event, repeated same intern, per-doc overlap не удваивают total; observations отдельно от active report count | BE + QA |
| V3-T27 | [from,to), 7/30/90 days, daily timezone/as_of, границы версий/owners/teams, cursor stable; нет history/exposure/denominator=0 → нет выдуманного процента | BE + FE |
| V3-T28 | Mentor cohort/own task и docs-owner scopes различаются; revoke/foreign role/filter/cache hit не раскрывают title/count/refs | BE + FE + QA |
| V3-T29 | Small-cell suppression в rows/totals/daily/percent, no raw intern drill-down; CHECK_UNAVAILABLE/LLM/Telegram не проблема качества ТЗ | BE + QA |
| V3-T30 | Две role dashboards: фильтры/empty/loading/error/suppressed, drill-down только в доступный report; просмотр не создаёт friction/report, human edit/publication сохранены | FE + QA |

Live smoke — не fake-provider test: fake tests остаются CI gate для ветвлений, а actual
primary цепочка требует отдельного помеченного отчёта AI. При недоступном account/key/
бюджете gate V3-T20 остаётся OPEN, а не «PASS на fallback». Реальные платные вызовы
не выполняются из общего make check и не требуются для этой документационной поставки.
