# Работа пяти участников

2026-11-11 · назначения по прямому поручению пользователя. TL — владелец проекта;
Backend, AI Engineer, Frontend, Fullstack–QA–Integration — остальные четыре участника.
Личные имена/GitHub handles не предоставлены и не придуманы; ответственность по ролям
действует сразу, внешние права не создаются документацией.

| Участник | Основная работа | Review | Рабочая база |
|---|---|---|---|
| TL | Архитектура/API policy, contract gate, общие scripts/infra/CI, интеграция и demo | BE/AI/FE для своих контрактов; TL окончательно сводит | feature/team-start-foundation, существует |
| Backend | Go app + corporate mock, app/corporate migrations/seed, public/corporate/journey/events schemas и свои tests | AI на Go↔AI, FE на public DTO, TL на границы | feature/backend-mvp-v2, существует на GitHub |
| AI Engineer | AI schemas/service, kb migrations/knowledge ACL fixtures, provider/fallback/RAG/drafts/summaries/evals, свои tests | Backend и TL по границам | feature/ai-mvp-v2, существует на GitHub |
| Frontend | UI/typed DTO consumption, component tests и полный browser E2E | Backend по DTO, TL по общему demo | feature/frontend-mvp-v2, существует на GitHub |
| Fullstack–QA–Integration | **Только RP-QA-01:** адаптировать два существующих API-теста и QA-план | Backend проверяет API semantics; TL принимает отчёт | feature/qa-01-m1, существует на GitHub |

[Handoff для каждого](assignments/README.md), [полный backlog](backlog.md),
[read-only inventory веток](branches.md). Для Fullstack не подразумевается помощь всем
остальным: дополнительные задачи только новым явным решением TL. Слово Integration
в названии роли не делает его владельцем всех инфраструктурных проблем.

## Владение файлами и исключения

| Зона | Единственный автор | Согласование |
|---|---|---|
| backend/, backend/migrations/ | Backend | TL/потребитель |
| mock-services/, mock-services/migrations/, data/seed/ и journey JSON | Backend | TL + AI для ссылок на knowledge |
| ai-service/, ai-service/migrations/, data/knowledge/ | AI Engineer | Backend по IDs/ACL boundary |
| contracts/v2/common/public/journey/events/corporate schemas и их fixtures | Backend | AI/FE/TL по contract-handoff |
| contracts/v2/ai.schema.json и AI fixtures/tests | AI Engineer | Backend/TL |
| frontend/ | Frontend | Кроме зарезервированного API test ниже |
| frontend/e2e/onboarding.spec.ts и docs/testing/qa-01-m1.md (пока в QA-ветке) | Fullstack–QA–Integration | Backend + TL; Frontend не переписывает эти файлы |
| frontend/e2e/ остальные browser scenarios | Frontend | TL, без дублирования QA smoke |
| scripts/, compose.yaml, Dockerfiles, Makefile, .github/, root tooling | TL | Component owners; исключение scripts/check_repo.py только contract validation в RP-CONTRACT-BE-01 |
| tests/test_contracts_v2_backend.py, tests/contract_v2_support.py | Backend | TL; helper общий |
| tests/test_contracts_v2_ai.py | AI Engineer | Backend; common helper не дублировать |
| docs/team/, общий scope/architecture/testing policy | TL | Участники передают факт/замечания; не переписывают общий backlog параллельно |
| SDD своей области | Владелец реализации | TL при смене scope/API/ownership |

Фактически созданные contract/tooling пути перечислены в TL record; runtime пути остаются у авторов.
Runtime owners app/kb/corporate не меняются: Go app, Python AI kb, отдельный mock corporate.
Передача разработки mock Backend касается людей/каталогов, не переноса corporate SQL в Go app.
TL не выбирает внутренние AI решения за AI Engineer. Каждый пишет tests собственного кода
и отвечает за >80% coverage; Fullstack не отвечает за чужой denominator.

## Контракты и зависимости

TL-пакет [contract-baseline](../architecture/contract-baseline.md) готов. RP-CONTRACT-01
разбит на TL design, BE schemas, AI schemas, FE consumption и final TL review в
[handoff](contract-handoff.md). Не помечать parent DONE после одних документов.
v1 contracts/DDL/seed остаются legacy; v2 schemas сведены, но consumer gate открыт; RP-DATA-01 также разделена по владельцам.
RP-AI-CORE-01 нужен для раннего access flow, RP-AI-DIAG-01 — для buddy/reverse; не блокировать
день 3 ожиданием всей AI-фичи дня 5.

## Работа с ветками

Текущее поручение TL integration выполняется в feature/team-start-foundation. Владелец
разрешил новую свою ветку при необходимости, но она не понадобилась. Ветки BE/AI/FE/QA
существуют и не меняются TL-агентом. Shared tooling/infra/docs и импорт проверенных
contract artifacts в TL checkout разрешены; component runtime/DDL/seed — у их авторов.
Прежние docs-only ограничения RP-DOC/RP-TEAM были границами тех поручений.
Публикация, PR/merge/permissions остаются операциями владельца. Локальных commit/push/PR
нет. [Проверенный inventory](branches.md), [TL record](tl-readiness.md).

## Передача результата и приёмка

Участник получает один role handoff с очередью задач/зависимостей/DoD. Перед стартом AGENTS
и Before starting обязательны; проверяется существующий код и актуальность рабочей базы.
Результат: изменённые файлы, команды/выходы tests/coverage, API примеры, remaining blockers.
TL вносит фактический статус в общий backlog, не обещание результата.

Компонентные проверки — у автора. Frontend ведёт browser E2E, Fullstack только два API
smoke, TL сводит общую интеграцию с реальным restart/offline/clean DB и demo.
Нельзя выдавать reread за restart, health/fixtures за готовую фичу и неполученный review за approval.
Ошибки исправляет владелец кода; QA не становится общей очередью разработки.

Ежедневно результат/следующая задача/блокер в согласованном TL канале (канал не придуман).
Оригиналы кейса/бюджет/ключи/площадка остаются внешними решениями; offline P0 независим от live.
