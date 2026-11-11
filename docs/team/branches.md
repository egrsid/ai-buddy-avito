# Ветки и стартовая база команды

Проверка 2026-11-11, чтение без checkout/fetch/merge/rebase/commit/push и без изменения refs.
Локально текущая ветка `feature/team-start-foundation`, рабочее дерево перед назначением
задач чистое. Новое распределение пока только в её рабочем дереве, публикация — владелец.

## Что действительно существует

Проверены локальные refs/worktree и полный список GitHub branches (две страницы, последняя
пустая). Git ls-remote в sandbox не получил DNS; актуальный remote проверен через GitHub
connector. Локальный `git branch -a` не содержал QA-ветку, поэтому не использован как
доказательство отсутствия других remote branches.

| Ветка | Где обнаружена | Содержимое на момент проверки | Использование |
|---|---|---|---|
| main | Local + GitHub | 30c5d08908aace5d10318adc429bbaa837b1a929; каркас Go/AI/mock/FE, Compose/CI/SQL/seed и старые S1–S4 docs | Существующая основная ветка; не база новой реализации до переноса нового плана владельцем |
| feature/team-start-foundation | Local/current + GitHub | e6c1a0ee2b6c21f7f2bfdb7378cf53ff4186a986; main + 1 commit: replan docs/brief, исполняемые файлы те же | TL, общие документы и будущая база согласованных контрактов; текущие назначения ещё не committed |
| feature/qa-01-m1 | Только GitHub в данном checkout | main + 1 commit; два новых QA-файла и одна строка legacy backlog; от foundation diverged: ahead 1 / behind 1 | Сохранить для Fullstack–QA–Integration, адаптировать существующую QA-работу по RP-QA-01 |

Источники чтения: [main](https://github.com/egrsid/ai-buddy-avito/tree/main),
[foundation](https://github.com/egrsid/ai-buddy-avito/tree/feature/team-start-foundation),
[QA compare к main](https://github.com/egrsid/ai-buddy-avito/compare/main...feature/qa-01-m1),
[QA compare к foundation](https://github.com/egrsid/ai-buddy-avito/compare/feature/team-start-foundation...feature/qa-01-m1).
Это снимок проверки, ветки могут измениться позднее; перед передачей обновить read-only сведения.
Личность автора QA-ветки не выводится из её названия; передачу существующей работы согласует владелец.

## Что уже подготовлено в QA-ветке

- [frontend/e2e/onboarding.spec.ts](https://github.com/egrsid/ai-buddy-avito/blob/feature/qa-01-m1/frontend/e2e/onboarding.spec.ts):
  96 строк, два Playwright **API integration** теста. Login/cookie/Origin/CSRF,
  GET/PATCH `/api/v1/tasks`, version conflict, изоляция intern/buddy, 401/403 и reread.
  Это не тест браузерных кликов и не фактический рестарт backend.
- [docs/testing/qa-01-m1.md](https://github.com/egrsid/ai-buddy-avito/blob/feature/qa-01-m1/docs/testing/qa-01-m1.md):
  41 строка legacy acceptance-плана; автор явно отметил отсутствие реализации/UI/restart приёмки.
- `docs/team/backlog.md`: только перевод старой QA-01 в IN_PROGRESS. Нельзя переносить
  старый backlog поверх нового плана. Прогресс сохранён в RP-QA-01 текущего backlog.

Сохраняем тестовый каркас, отдельные APIRequestContext, setup/cleanup, cookie/Origin/CSRF
и отрицательные проверки. Меняем v1/tasks/PATCH done на v2/goals и read/ownership сценарии.
Проверку version conflict сохраняет Backend в RP-VERIFY-01/компонентных integration tests;
браузерные действия и настоящий restart — Frontend/TL в RP-E2E-01/RP-INTEGRATION-01.
Подготовленный API-тест не объявляется пройденным новым E2E.

## Назначенные и планируемые рабочие ветки

| Участник | Ветка | Статус | База и правило |
|---|---|---|---|
| TL (владелец проекта) | feature/team-start-foundation | Существует, текущая | Общая подготовка/контракты/инфраструктура в своей рабочей папке |
| Backend | feature/backend-mvp-v2 | Предложена, **не существует и не создана** | Владелец готовит от опубликованной актуальной foundation |
| AI Engineer | feature/ai-mvp-v2 | Предложена, **не существует и не создана** | Та же принятая база; собственная папка |
| Frontend | feature/frontend-mvp-v2 | Предложена, **не существует и не создана** | Та же принятая база; собственная папка |
| Fullstack–QA–Integration | feature/qa-01-m1 | Уже существует удалённо | Продолжить свою QA-работу после включения нового baseline владельцем; не заменять ветку и не стирать тесты |

Названия для трёх отсутствующих веток — план владельцу, не выполненные Git-операции.
Не назначать всем одновременную работу в одном shared checkout и не выдавать main со
старым планом за новый baseline. Имена людей/handles можно добавить позднее: ответственность
уже назначена по пяти ролям из поручения, внешние доступы не выдавались.

## Порядок передачи изменений владельцем

1. Владелец сохраняет и публикует текущие назначения/контрактный пакет foundation.
2. Владелец готовит отдельные рабочие папки и отсутствующие ветки для BE/AI/FE от этой базы.
   Участник перед реализацией проверяет, что новые handoff/backlog присутствуют.
3. Владелец/автор QA-ветки включает в неё новую документацию, сохраняя два QA-файла.
   В конфликте backlog источник нового scope — foundation; старый QA status переносится
   как факт подготовленных тестов, не как возврат task-status M1.
4. BE и AI поставляют свои contract-файлы раздельно; после consumer review TL фиксирует
   принятый baseline, владелец распространяет его во все рабочие ветки. Нельзя разрабатывать
   потребителей на взаимно расходящихся DTO.
5. Интеграция/PR/merge/main/protection — операции владельца. Агенты не меняют чужие ветки,
   не создают/не переключают ветки, не делают commit/push в этом поручении.

Никакого reset/force-push/rebase чужой ветки для обновления плана не требуется от агента.
Выбор способа включения общей базы остаётся за владельцем и автором ветки.
