# AI-предложение уточнения ТЗ — спецификация

## Цель и предусловия

Автор владеет текущим TaskBrief и report его версии. Есть bounded field/old_hash, brief/draft revision и разрешённые refs; автор может добавить уточнения.

## Пользовательский сценарий

Автор выбирает report → Go резервирует proposal → после commit Python генерирует structured draft → Go проверяет результат → UI показывает diff/questions/origin → автор выбирает changes → apply в draft → отдельная ручная публикация.

## Правила и критерии приёмки

- **EDIT-01.** AI получает поле отчёта, safe aggregate/hypothesis ≤2000 символов и допустимые refs, без списка intern/чужих данных. Scope проверяется до provider.
- **EDIT-02.** Выход ограничен ready/needs_input/no_change/invalid/unavailable и schema-valid changes/questions/origin. Недостающие сроки/системы/критерии превращаются в вопросы, не выдумываются.
- **EDIT-03.** Allowlist field paths и old_hash обязательны. Нельзя менять IDs, permissions, mandatory journey steps или ссылки вне переданного allowlist; raw HTML и секреты отвергаются.
- **EDIT-04.** Инъекция, обвинения или чужие refs отклоняют опасный output. Unsupported factual change не применяется; безопасный вопрос/отказ остаётся допустимым результатом.
- **EDIT-05.** Генерация не удерживает app transaction. Generation token, полная brief revision, TTL 10 минут и повторная ACL не допускают поздний результат после discard/revoke.
- **EDIT-06.** Применяются только выбранные непересекающиеся changes. Параллельный human edit/base mismatch/stale proposal даёт conflict без частичной записи.
- **EDIT-07.** Apply валидирует целый BriefContent и меняет только draft. Published версия, назначения и progress не меняются; автор отдельно публикует.
- **EDIT-08.** Метка model/primary/secondary/offline отражает источник. Ручной редактор доступен при отказе; автоматическая правка criteria ограничена первым существующим критерием.

## Контрольный пример

Исходный текст «Опишите результат в свободной форме» и ответ автора «нумерованный список выполненных проверок и результатов» позволяют предложить уточнение. Без ответа AI задаёт вопрос о формате вместо нового обязательного требования.

[Дизайн](design.md) · [Реализация и проверки](tasks.md) · [Общий scope](../../requirements.md).
