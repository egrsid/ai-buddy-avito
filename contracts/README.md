# Статус исполняемых контрактов

2026-11-11: v1.schema.json и examples.json сохранены без изменений как legacy каркас.
Они описывают TaskStatus todo/in_progress/blocked/done, intern/buddy, demo_public,
старые action/task DTO. Эти payload не являются target-моделью нового MVP.

Целевые API и события описаны в [api-contracts](../docs/architecture/api-contracts.md),
[event-contracts](../docs/architecture/event-contracts.md),
[journey-template](../docs/architecture/journey-template.md) и
[security](../docs/architecture/security.md). [TL baseline](../docs/architecture/contract-baseline.md)
готов; [contract handoff](../docs/team/contract-handoff.md) назначает Backend common/public/
journey/events/corporate schemas и validation, AI Engineer — AI schemas, Frontend —
consumer check, TL — окончательный review. RP-CONTRACT-01 остаётся IN_PROGRESS.
Backend положил исполняемые схемы в `contracts/v2/`: common, public, journey, events,
corporate, их examples и `invalid/backend.json`. Общий offline helper —
`tests/contract_v2_support.py`; `make check` гоняет v1 и v2 раздельно и не ходит в сеть.
`ai.schema.json` ещё не написан: его автор — AI Engineer. До записанного TL review
не начинать v2 runtime на собственной версии DTO.

Текущий make check подтверждает целостность legacy schemas/examples/seed и ссылки,
а не полноту нового контракта или готовность нового MVP. JSON, SQL, seed и код в рамках
документационного перепланирования не изменяются.
