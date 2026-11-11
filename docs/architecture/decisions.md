# Архитектурные решения

Версия 2.0 · 2026-11-11 · основание: [replan](../../CODEX_PROJECT_REPLAN.md).
Принято для целевого проектирования; это не отчёт о реализации. TL review общих контрактов
и владения данными остаётся обязательным до реализации. История решений сохранена.

## Исторические ADR · 2026-11-10

| ID | Исходное решение | Статус после перепланирования |
|---|---|---|
| ADR-001 | История только в Go/PostgreSQL; Python получает ограниченный контекст | Сохранено; расширено ADR-014 |
| ADR-002 | Python владеет kb/фрагментами/pgvector | Сохранено; ACL добавляет ADR-018, именование ADR-024 |
| ADR-003 | Python предлагает, Go исполняет подтверждённые действия | Сохранено; уточнено ADR-016 |
| ADR-004 | SSE Python → Go → браузер, запрос run отделён от подписки | Сохранено |
| ADR-005 | Одна PostgreSQL, app/kb/corporate, разные владельцы/миграции | Сохранено; ADR-024 |
| ADR-006 | Синтетический local/test login, cookie, CSRF | Сохранено; роли/назначения расширяет ADR-017 |
| ADR-007 | Общий и task chat каждого стажёра | Superseded ADR-025: диалог привязан к goal/step |
| ADR-008 | Отдельный persistent corporate mock, без MCP | Расширено ADR-021; таймер approved из старого mock-плана отменён |
| ADR-009 | Poll 5s, SSE только AI | Сохранено |
| ADR-010 | Один ограниченный агент; все знания demo_public | Частично superseded ADR-018: один агент сохранён, всеобщий доступ отменён |
| ADR-011 | Сначала S2, coverage >80% с первой фичи | Порядок superseded недельным планом; coverage сохранён |
| ADR-012 | Node 26, Go 1.27, Python 3.12, PostgreSQL 17/pgvector 0.8.2; npm/uv/SQL runner | Сохранено; точные версии в manifests |

Старый ручной PATCH task и tool update_task_status больше не целевые операции: ADR-015.
Полная legacy схема остаётся в contracts/v1.schema.json до RP-CONTRACT-01.

## ADR целевого MVP · 2026-11-11

| ID | Решение | Основание и последствия |
|---|---|---|
| ADR-013 | Deterministic Journey Templates | Один утверждённый JSON-маршрут, версии, DAG, allowlists проверок; LLM не меняет обязательные этапы |
| ADR-014 | Go-owned Business State | Только Go меняет app, управляет goal/step/evidence/blockers/friction/candidates; Python выдаёт предложения |
| ADR-015 | Evidence-driven Step Verification | unverified/ready/blocked/waiting_external/verified, доверенные сигналы; ни ответ LLM, ни ручное done не доказывают готовность |
| ADR-016 | AI Action Confirmation | Неизменяемый preview, TTL 10m, подтверждение intern именно отправки; approval отдельной ролью; key/reconcile исключают дубли |
| ADR-017 | Resource-level Authorization | Role + team + resource + permission + document ACL + ownership; approver/docs owner scoped, deny by default |
| ADR-018 | Permission-aware RAG | Go вычисляет scope; Python фильтрует до LLM, проверяет результаты; Go проверяет citations/открытие; demo_public не единственная visibility |
| ADR-019 | Deterministic Friction Grouping | Ключ journey_id + step_id + error_code, distinct interns >=2; версии сохраняются в событиях, ACL области разделены, unique candidate |
| ADR-020 | Human-reviewed Documentation Improvements | proposed/under_review/accepted/rejected/resolved; accepted не публикует; resolved с проверенной версией, без AI auto-edit |
| ADR-021 | Mock Corporate Integrations | Отдельный mock IAM/access/DB check, ручное scoped approval через Go; grant отдельно от approved; никакого таймера выдачи прав/реального SQL |
| ADR-022 | Offline LLM Fallback | Детерминированный mock provider без сети/ключа, весь P0-путь доступен; offline не выдаётся за live eval |
| ADR-023 | Trusted Event Processing | Только Go adapters/system producer регистрируют evidence; дедупликация/корреляция/check ownership/version в транзакции |
| ADR-024 | Сохранение физических схем | knowledge — логическая область Python в существующей kb; corporate остаётся у mock. Переименование не даёт продуктовой ценности и требует ненужной миграции ролей |
| ADR-025 | Контекст Goal/Step | Один общий чат и по одному на goal/step; чужие цели/истории не попадают в prompt; legacy task_id заменяется при синхронном переходе |

ADR-019: базовая группировка не включает версию в ключ, как требует brief. Один journey_id
в P0 соответствует одной команде, ресурсу и ответственному. События разных ACL-областей
не смешиваются. Перед второй командой/версией, меняющей семантику шага, нужен TL review;
step_id нельзя переиспользовать для другого смысла. Это минимальное MVP-допущение.

## Изменение решения

Причина, потребители, миграции, безопасность и проверки описываются локально; владельцы
потребителей и TL проверяют изменение до реализации. Старое ADR помечается superseded,
не удаляется. Публикацию и PR выполняет владелец. Текущая задача — только документация,
без Git branch операций, JSON/DDL/seed и кода.
