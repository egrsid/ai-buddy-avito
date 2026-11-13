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
