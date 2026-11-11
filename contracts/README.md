# Исполняемые контракты

Legacy v1.schema.json/examples.json сохранены для прежнего bootstrap: task статусы,
две роли и demo_public. Они не определяют runtime нового MVP.

В v2/ сведены предъявленные Backend и AI schemas/examples/invalid cases. Происхождение,
TL review и незакрытые consumer замечания: [integration record](../docs/team/tl-readiness.md).
BASELINE.sha256 фиксирует проверенный снимок, не означает финальное acceptance.

Проверки: make check; python -m scripts.contract_baseline. Все refs локальны, без HTTP.
AI/public используют общий common; validator/test helper один. Авторские JSON импортированы
без изменения. После принятых правок Backend/AI TL обновляет lock командой
`uv run --frozen python -m scripts.contract_baseline --write` и повторяет checks/reviews.

RP-CONTRACT-01 IN_PROGRESS: FE должен синхронизировать bindings, Backend — дополнить
StepActionList/null cases, затем обе стороны подтверждают BE↔AI и final consumer review.
Наличие схем/зеленых fixtures не подтверждает ACL, event correlation, timeouts или MVP E2E.
