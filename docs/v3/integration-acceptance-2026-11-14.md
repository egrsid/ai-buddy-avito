# Локальная интеграционная приёмка v3 · 14 ноября 2026

Владелец разрешил runtime-интеграцию и исправления во всех ветках; прежнее docs-only
ограничение снято. Публикация/PR не выполнялись, main b6f940d сохранён.

## Источники и зависимости

Fetch обнаружил новую feature/frontend-v3 363a0e5. Её merge 1ecdb9f уже включает
локальную TL-поставку 0f7838c и сохраняет Backend corrections. Fast-forward в
feature/local-v3-integration прошёл без конфликтов. В составе: Backend 2ace307,
AI 109e33b, новый FE e488882, Telegram summary bb59dae/f92af43, UI 363a0e5.
Остальные remote refs совпадают с предыдущим аудитом; main остаётся v2.
Fetch сообщил о старом отсутствующем объекте 25ac58f, актуальные refs и деревья доступны.

Frozen uv lock и frontend build проверены; npm ls не выявил missing/invalid dependencies.
Go vet/tests выполнены в cached Go toolchain image, зависимости загружены с GOPROXY=off.
Применены миграции 001–009 на новой QA БД; старые migrations не переписывались.
Проверены настоящий ingest/pgvector/ACL, отдельные app/corporate runtime роли.

## Результат

- Shared make check: 103 PASS; JSON contracts v2/v3, local docs links, SQL/YAML,
  lint/format и shared regression tests.
- Frontend: build и 593 tests PASS, coverage строк 96.40%.
- AI: 489 PASS, 5 DB tests отдельно; coverage 97.58%. Mock: 6 PASS, 98.05%.
- Go: vet и tests PASS, statement coverage 83.2%; line coverage 2275/2735 = 83.18%.
- AI contact summary eval: 12/12, safety 6/6; task clarity: 24/24, safety 11/11.
  Это offline eval, не новая проверка реального провайдера.
- Browser: полный DB/confirm/approval/IAM/SSL/docs-owner путь с реальным restart;
  session restore; два QA API ACL/CSRF теста; полный v3 mentor/task/report/successor/
  Telegram-copy/mobile/statistics путь — PASS на отдельном свежем QA dataset.
  Исправленный chat-layout проверен отдельно на итоговом стенде: PASS. Итого 6/6 сценариев.

Новая поставка сохраняет deterministic grouping/distinct threshold, неизменяемые published
версии, optimistic concurrency, scoped read/export и запрет internal escalation writes.
Human review не публикует исправление и не выставляет verified. Telegram проверялся без
отправки реальному человеку. UI потребляет Go, AI не пишет app/corporate.

## Исправления этого review

1. Origin без server metadata больше не определяется по словам модели: неизвестный источник
   явно помечается; streaming тоже ждёт trusted origin. Штатный mock отличается от outage.
2. Повторная отправка чата заблокирована уже во время POST /runs, до получения run ID.
3. Chat-layout E2E считает сохранённые сообщения, а не пустую заглушку в пустом чате.
4. Demo runner принимает DEMO_FRONTEND_PORT/DEMO_BACKEND_PORT, согласует APP_ORIGIN и
   проверяет диапазон портов. Теперь QA/restart не конфликтуют с другим локальным стендом.

## Что остаётся открытым

V3-T20 и новая actual-live fault/usage/latency приёмка не выполнялись: владелец явно
выбрал offline. Старые live отчёты автора сохранены и не выданы за новый локальный прогон.
Go race detector требует C compiler, отсутствующий в cached image; обычные vet/tests
не заменяют race. Cold build без cache и remote CI этим прогоном не подтверждены.
Формальный review отдельных потребителей и production retention для реальных данных не
подменяются этим техническим review. Это проверенный локальный synthetic demo, не публичный production release.

## Запуск и данные

Docker project ai-buddy-demo-v3: UI http://localhost:15174, Go http://localhost:18081.
Повтор: `DEMO_FRONTEND_PORT=15174 DEMO_BACKEND_PORT=18081 python3 -m scripts.demo up --offline --project ai-buddy-demo-v3`.
Volumes сохраняются, данные прошлой репетиции не удалялись. QA отдельно:
ai-buddy-demo-v3-qa-final, порты 15175/18082; component DB buddy_test_v3_final.
Платные запросы не выполнялись. В `.env` и ключах изменений нет.

## Уточнения UX по приёмке владельца

Повторное создание выполненной цели возвращает прежнюю цель; список загружает все страницы
сразу и скрывает повторные экземпляры одного маршрута от старых репетиций, сохраняя БД.
Все выполнены → поздравление без предложения повторить маршрут. Раздел стажёра обозначен
«ТЗ от наставника», кнопка вопроса раскрывает Telegram-форму и переводит к ней фокус.
Повторное назначение возвращает закреплённое назначение без дубля и скрытого adopt.
Архив обращений убран из UI; исторические данные остаются защищёнными на сервере.
Добавлены intern-d…intern-i команды A, без фиктивных событий/verified.
Полный ручной сценарий команды — [TESTING_V3.md](../../TESTING_V3.md).
