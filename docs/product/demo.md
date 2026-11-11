# Демонстрация MVP — около пяти минут

Статус: сценарий приёмки, пока не реализован. Задачи RP-INTEGRATION-01/RP-DEMO-01 ведёт TL.
Frontend выполняет browser RP-E2E-01; Fullstack ограничен двумя API smoke RP-QA-01.
Это демонстрация synthetic mock API, не интеграция с Авито и не реальная выдача прав.
Главная история — работающий feedback loop, а не отдельные чат/заявка/словарь.

## Предусловия после реализации

Compose поднят на чистой выделенной local demo-БД по README, migrate/seed повторяемы.
Подготовлены образы/зависимости (первая сборка требует сети); выбран LLM_MODE=mock,
нет provider key и исходящих LLM-вызовов. Отдельный отчёт live, если доступен, не подменяет
offline rehearsal. Режим и synthetic checks видны в UI. Нет ручного SQL или скрытых скриптов
для продвижения статусов. Текущий seed v1 этот сценарий не обеспечивает.

Dataset v2: intern-a и intern-b команды A, intern-c команды B, buddy-a/buddy-b,
approver-a и docs-owner-a. Goal db-access-team-a, ресурс db-team-a-test, инструкция одной
фиксированной версии с намеренно пропущенной SSL-настройкой. Другие БД/закрытые документы
подготовлены для negative checks. До демонстрации допускается заранее созданная submitted
заявка intern-b для экономии переключений, но её synthetic approval и отсутствие
предварительного friction/candidate явно раскрываются; основной полный цикл показывает A.

## История по минутам

| Минута | Действие | Проверяемый результат |
|---|---|---|
| 1 — цель | intern-a входит и выбирает разрешённую DB-цель; Go IAM check | Видны маршрут, dependencies, absence of grant и blocker; чужие ресурсы скрыты |
| 2 — AI action | AI готовит structured draft; intern видит exact preview и подтверждает; approver-a отдельно принимает mock решение | Одна submitted заявка, явное approval, Go recheck IAM; никакой выдачи по timer/слову «да» |
| 3 — Proof of Readiness | При наличии grant intern запускает safe connection check с исходной synthetic настройкой | DB_SSL_REQUIRED, goal не verified; safe check/error/blocker/friction сохранены |
| 4 — Buddy Debug Bridge | Intern проверяет diagnostic preview и отправляет buddy-a; buddy отвечает; intern выбирает allowlisted ssl_mode=require и повторяет check | Snapshot содержит goal/step/attempts/checks/refs, не секреты; ответ resolved, затем passed evidence и verified goal |
| 5 — Reverse Onboarding | intern-b проходит тот же journey/step с исходной SSL-настройкой и уже отдельно одобренным grant | Второй distinct intern, одна candidate card с count=2; docs-owner-a видит error/instruction/hypothesis/fix и принимает/отклоняет |

Accepted не меняет документ/маршрут. Во время demo не публиковать исправленную инструкцию
до ошибки B: иначе история повторения перестаёт быть воспроизводимой. Гипотеза «в инструкции
нет SSL» проверяется человеком, не считается доказанной одной лишь частотой ошибок.

Финальный тезис: «Мы помогаем одному стажёру выполнить задачу и обнаруживаем проблемы,
которые могут мешать следующим новичкам, чтобы ответственный человек мог их устранить».

## Контрольные ветки до записи видео

1. Быстрый success: корректный ssl_mode=require, grant verified → connection passed → Goal verified.
2. No confirm: нет mock write; повтор confirm: один ID; crash-after-create: same-key recovery.
3. Только intern confirm или таймер: доступ не выдан; rejected и approved без grant не успех.
4. Ошибка дважды у A: до B candidate нет; повтор B/event/concurrent threshold: один candidate.
5. intern-c/неназначенный buddy/approver/owner не видят чужие объекты; prompt injection
   и restricted/personal fixture не попадают в provider input/title/citation/handoff.
6. SSE cancel/disconnect → partial и REST recovery; refresh/restart сохраняют состояние;
   mock недоступен → unknown/unavailable, без выдуманного успеха.
7. После owner accepted — исходная версия не изменилась; resolved только с human-reviewed
   исправленной ссылкой. Ответ buddy сам не выставляет verified.

## Комплект сдачи

README с проверенными командами/версиями/тестовыми ролями; SDD/API/events; synthetic data;
реальный отчёт coverage >80% отдельно по компонентам; PDF-презентация; видео/rehearsal.
PDF/видео создаются после работающего пути, не в рамках docs-only перепланирования.
TL сверяет оригинальные условия/формат/сроки в RP-TL-02. Локальный Compose — базовый demo;
публичная площадка требует отдельной защищённой auth/HTTPS, demo-login отключён.

В репетиции зафиксировать commit/dataset/template версии, mode, команды, результат
каждого контрольного пункта и оставшиеся ограничения. До этого ни один пункт не заявлен
как пройденный; liveness или подготовленные fixtures не являются демонстрацией MVP.
