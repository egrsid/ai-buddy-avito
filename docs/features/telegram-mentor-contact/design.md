# Telegram вместо внутреннего обращения — design v3

**Target, не реализовано.** [Поведение](spec.md), [общие DTO/data/state/миграция](../../v3/architecture.md).

## Компоненты

Go резолвит assignment/contact, строит t.me URL и короткоживущий scoped preview/export. React выполняет clipboard/open после явного действия пользователя. Python может предложить safe summary, но не видит Telegram контакт и не отправляет сообщения.

## Ошибки и совместимость

При missing contact — понятный empty state; при revoked scope/expired preview — отказ и обновление. Старые внутренние обращения сохраняются read-only по ACL, новые в v3 запрещены.

Новые таблицы и contract schemas поставляют владельцы после V3-CONTRACT-01. Новые SQL
migrations, idempotency/expected_version и restart tests обязательны. Старые данные не
переписываются ради demo. [Порядок работ](../../v3/delivery.md).
