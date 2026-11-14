**Следующее планирование — v4:** [пакет](../../v4/README.md),
[задачи и handoff по ролям](../../v4/delivery.md), [acceptance](../../v4/testing.md).
Ветка docs/v4-planning, docs only. Компонентные runtime tasks пока TODO;
нижний v3/v2 handoff — история, не актуальная очередь новых v4 задач.

# Назначение: Fullstack–QA–Integration

## Следующая работа — v3

Ваши задачи: V3-QA-01. Читать [Product/SDD](../../v3/README.md),
[единый handoff и зависимости](../../v3/delivery.md), [acceptance](../../v3/testing.md).
Общая база main b6f940d + принятая документация docs/v3-planning. Новые v3 branches пока
не созданы. Старые задания ниже относятся к v2; не возобновлять internal buddy workflow.
В текущем поручении разрешено только проектирование/документация, runtime tasks TODO.


Текущее поручение владельца: TL + QA + AI доводят local demo, только в своих branches.
В TL checkout выполнены consumer integration fixes и полная QA browser приемка:
4 PASS, включая A/B/C/restart/ACL; 475 FE tests/94.34%, 57 shared tests, 5 AI DB tests.
Стандартный чистый стенд готов: `make demo-offline`, http://localhost:15173.
BE/FE branches/refs не менялись; исходный RP-QA-01 сохранен. [Факты и границы](../tl-readiness.md).
Историческое ограничение QA только двумя smoke ниже этим новым поручением расширено.


**Одна задача: RP-QA-01.** Минимальный объём — адаптировать два существующих API integration
теста и один QA-план. Ветка **feature/qa-01-m1 уже есть на GitHub**. Её не заменять и не
терять работу автора; владелец сначала включает новую общую базу. [Inventory](../branches.md).

## Что уже сделано и что сохранять

В своей ветке есть frontend/e2e/onboarding.spec.ts (96 строк, два Playwright API-теста)
и docs/testing/qa-01-m1.md (41 строка). Они написаны для /api/v1/tasks и ручного status,
поэтому для нового MVP требуют адаптации. Сохранить login helper/APIRequestContext,
Origin/cookie/CSRF/cleanup и negative ownership подход. Код не является browser E2E,
повторный GET не проверяет реальный restart. Прогон v2 ещё не выполнен.

Не переносить старый docs/team/backlog.md поверх нового. Старый QA-01 IN_PROGRESS уже
учтён в RP-QA-01. Общие contracts/SDD/roles читать из нового baseline, не из старого main.

## Ограниченный результат двух тестов

1. **Своя цель и изоляция.** Login intern-a; получить разрешённый journey, начать Goal,
   прочитать goal/steps/progress. Повторное чтение сохраняет данные. Другой intern-b
   той же team-a не читает Goal A; intern-c другой команды также получает отказ;
   buddy без права на список целей не получает его. Поля verified/total/percent сверяются
   с новым DTO, никакого PATCH task/done. Данные/IDs брать из API, не hardcoded legacy UUID.
2. **Сессия и CSRF.** Без сессии /auth/me и /goals →401. После login попытка POST /goals
   без X-CSRF-Token →403 CSRF_INVALID. Проверить, что список/состояние целей не изменились.
   Для legitimate create использовать Origin и UUID Idempotency-Key по контракту.

Обновить QA-план: новые routes/данные, что эти два теста проверяют и чего не проверяют,
команда и фактический результат запуска. Проверки version conflict переданы Backend
(RP-VERIFY-01), browser/reload/restart/full feedback — Frontend/TL (RP-E2E-01/RP-INTEGRATION-01).

## Разрешённые файлы

- frontend/e2e/onboarding.spec.ts — существующий test своей ветки, адаптация v2.
- docs/testing/qa-01-m1.md — существующий план, явно заменить legacy scope новым.

Без новых общих helper/framework/config, если достаточно существующего Playwright setup.
Если не хватает общих инструментов, передать конкретный blocker TL, а не брать новую область.
Общий backlog обновляет TL по вашему отчёту. В новой ветке foundation эти файлы не создавались
и ваша работа не копировалась/не перезаписывалась агентом.

## Зависимости и команда проверки

До реализации: владелец обновил базу QA-ветки; RP-CONTRACT-01 принят. До запуска:
RP-AUTH-01 + RP-JOURNEY-01, target seed/IAM доступны, Go и frontend proxy подняты TL/Backend.
Ожидание готовности UI всех страниц, AI/buddy/reverse для этих API-тестов не нужно.

В своей frontend папке, после установки зависимостей:

```sh
npx playwright test e2e/onboarding.spec.ts
```

Тесты используют APIRequestContext, не требуют browser clicks; глобальную browser
приёмку они не заменяют. BaseURL/Origin — существующая конфигурация окружения, не ключи.
Также make check и git diff --check. Если API ещё не готов, сообщить «не запущено/заблокировано»
с endpoint/ответом, не делать skip ради зелёного статуса.

## Что не назначено этой роли

Mock IAM/DB/access, SQL/seed/knowledge, Compose/CI, contract schema implementation,
покрытие чужих компонентов, вся security матрица, browser E2E, инфраструктурные исправления,
финальная интеграция и PDF/video. Их владельцы указаны в backlog, скрытого «помочь всем» нет.

Приёмка Backend + TL: два адаптированных теста и план, успешный прогон против настоящего
Go/DB/mock на готовом checkpoint, точные команды/выходы и ограничения. При обнаружении
дефекта представить воспроизведение владельцу компонента; не переписывать его код.

## Дополнение к v3 очереди

V3-T15…T30: multi-goal/progress, reason-specific fallback и actual live evidence, expected stats counters/ACL/window/suppression; legacy smoke не затирать.
Общие зависимости/каталоги/DoD — [delivery](../../v3/delivery.md), [матрица](../../v3/testing.md).
Текущий проход остаётся docs-only; эти runtime задачи TODO.
