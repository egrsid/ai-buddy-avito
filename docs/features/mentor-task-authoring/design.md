# Редактор и версии ТЗ наставника — design v3

**Target, не реализовано.** [Поведение](spec.md), [общие DTO/data/state/миграция](../../v3/architecture.md).

## Компоненты

Go/app хранит версии/sections/assignments и author ACL. FE показывает редактор/preview/diff/version labels. AI не публикует и не меняет критерии технической верификации. Только ссылки на одобренные проверки, не произвольные команды.

## Ошибки и совместимость

Чужое ТЗ/стажёр запрещены; stale update/publish → conflict. Adopt новой версии только явным preview/confirm; ни новая версия, ни человеческий комментарий не делают Goal verified.

Новые таблицы и contract schemas поставляют владельцы после V3-CONTRACT-01. Новые SQL
migrations, idempotency/expected_version и restart tests обязательны. Старые данные не
переписываются ради demo. [Порядок работ](../../v3/delivery.md).
