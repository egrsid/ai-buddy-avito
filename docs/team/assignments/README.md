# Пакеты задач пяти участникам

2026-11-11 · отправить каждому его файл ниже вместе с актуальной foundation.
[Общий backlog](../backlog.md) — источник статусов/зависимостей; [ветки](../branches.md)
различают реально существующие и ещё не созданные. Каждый сначала выполняет Before starting
из AGENTS.md. Назначения по ролям готовы; имена/handles не нужны для чтения/оценки задач.

| Участник | Его handoff | Первая работа | Ветка |
|---|---|---|---|
| TL (владелец) | [tl.md](tl.md) | TL baseline готов; принять поставки schemas/consumer review, подготовить рабочие базы | feature/team-start-foundation, существует |
| Backend | [backend.md](backend.md) | RP-CONTRACT-BE-01, затем app/corporate/seed/IAM/Go | feature/backend-mvp-v2, план, не создана |
| AI Engineer | [ai-engineer.md](ai-engineer.md) | RP-CONTRACT-AI-01, затем kb/knowledge и ранний offline CORE | feature/ai-mvp-v2, план, не создана |
| Frontend | [frontend.md](frontend.md) | Прочитать baseline, затем RP-CONTRACT-FE-01; UI и browser E2E | feature/frontend-mvp-v2, план, не создана |
| Fullstack–QA–Integration | [fullstack-qa-integration.md](fullstack-qa-integration.md) | Один RP-QA-01: адаптировать два имеющихся API-теста | feature/qa-01-m1, существует на GitHub |

Fullstack имеет минимальный реальный объём: один ограниченный smoke-пакет, без mocks,
infra, data, всей security матрицы или общего browser E2E. Остальные владельцы тестируют
свои реализации; TL сводит итог. Родительские RP-CONTRACT-01/RP-DATA-01/RP-AI-01 —
группирующие milestones, не новые независимые задачи.

## Как запустить работу

1. Владелец публикует текущие документы, подготавливает отдельные рабочие папки/ветки
   BE/AI/FE и включает новую базу в существующую QA-ветку, сохраняя её работу.
2. BE/AI начинают схемы по готовым [TL решениям](../../architecture/contract-baseline.md);
   Frontend читает DTO, формулирует замечания; Fullstack изучает свой тест и scope адаптации.
3. После схем FE проверяет потребление, BE↔AI сверяют границу, TL принимает комплект
   по [contract handoff](../contract-handoff.md). Документы сами не означают schema acceptance.
4. Принятая база доходит до всех веток; дальше каждый идёт по зависимости своих задач.
   AI CORE/FE fixtures не ждут готовности всего Go, но используют единые DTO.
5. Участники передают проверки/ограничения TL, статус в общем backlog обновляется по фактам.

Этим поручением код других участников не реализуется, схемы/рабочие ветки не создаются,
коммит/push/PR не выполняются. Уже существующий QA-код не переносится и не перезаписывается.

## Проверка назначения RP-TEAM-01

Выполнено 2026-11-11: make check — ссылки/legacy schemas/seed/SQL/YAML, lint/format и
18 tests passed. Дополнительная проверка — пять role handoff, 40 известных task IDs,
граф без циклов, один RP-QA-01 у Fullstack, согласованное владение mocks/browser/infra,
локальные ссылки/Markdown tables и git diff --check. Изменены только Markdown:
36 существующих + 9 новых файлов. HEAD e6c1a0e и четыре local branch/tracking refs сохранены.
GitHub branches/content прочитаны connector-ом; чужие ветки не изменялись и не копировались.
Ни schemas v2, ни продуктовые функции, ни Compose/E2E acceptance этой задачей не реализованы.
RP-TEAM-01 DONE; RP-CONTRACT-TL-01 DONE (design), RP-CONTRACT-01 IN_PROGRESS (schemas/review pending).
