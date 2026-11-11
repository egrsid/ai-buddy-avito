# Статус исполняемых контрактов

2026-11-11: v1.schema.json и examples.json сохранены без изменений как legacy каркас.
Они описывают TaskStatus todo/in_progress/blocked/done, intern/buddy, demo_public,
старые action/task DTO. Эти payload не являются target-моделью нового MVP.

Целевые API и события описаны в [api-contracts](../docs/architecture/api-contracts.md),
[event-contracts](../docs/architecture/event-contracts.md),
[journey-template](../docs/architecture/journey-template.md) и
[security](../docs/architecture/security.md). RP-CONTRACT-01 после TL/consumer review
добавляет согласованные machine-readable v2 schemas/examples и обновляет проверки
потребителей. До этого не начинать реализацию на собственной версии DTO.

Текущий make check подтверждает целостность legacy schemas/examples/seed и ссылки,
а не полноту нового контракта или готовность нового MVP. JSON, SQL, seed и код в рамках
документационного перепланирования не изменяются.
