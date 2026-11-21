# RP-QA-01 · Проверки целей и доступа

Статус на 21.11.2026: оба интеграционных API-теста прошли на локальном стеке с данными v2.
Тесты используют Playwright `APIRequestContext`.

## Суть фичи

Стажёр выбирает доступный маршрут онбординга, например получение доступа к тестовой БД,
и получает личную цель с шагами и прогрессом. Backend привязывает цель к версии маршрута
и рассчитывает прогресс по подтверждённым шагам. API разрешает стажёру видеть свои цели
и требует сессию и CSRF-токен для создания цели.

## Сценарии

1. **Цель и владение:** `intern-a` читает разрешённый journey, создаёт или получает активную
   Goal, сверяет steps и `progress.verified/total/percent`, перечитывает Goal. Тест сверяет
   из `/auth/demo-login`, что `intern-b` в той же team, а `intern-c` в другой. Оба не получают
   Goal A (`404` для прямого чтения); `buddy-a` не имеет доступа к списку Goals (`403`).
   Все ID берутся из ответов API.
2. **Сессия и CSRF:** без сессии `/auth/me` и `/goals` возвращают `401`. Создание Goal
   без `X-CSRF-Token` возвращает `403 CSRF_INVALID`; список Goals после запроса не меняется.

Создание выполняется с Origin, cookie-сессией, CSRF-токеном и новым UUID
`Idempotency-Key`. Тесты не меняют состояние шагов и не используют старый PATCH status.

## Предусловия и запуск

- Использовать согласованный v2 contract baseline и v2 seed с `intern-a`, `intern-b`,
  `intern-c`, `buddy-a` и доступными journeys.
- Backend auth/journey endpoints должны быть готовы; UI, AI, buddy, reverse onboarding,
  миграции и restart не проверяются этими двумя тестами.
- Поднять Go API и frontend proxy на окружении, указанном `E2E_BASE_URL`/`APP_ORIGIN`.
- Команда из `frontend/`: `npx.cmd playwright test e2e/onboarding.spec.ts --workers=1 --reporter=list`.

## Ограничения и результат

Проверка version conflict относится к Backend (RP-VERIFY-01). Browser UI, reload/restart
и полный пользовательский feedback path относятся к RP-E2E-01/RP-INTEGRATION-01.
В первом запуске PostgreSQL остановился на `scripts/bootstrap-db.sh` с кодом 127.
В рабочей копии скрипт переведён с CRLF на LF. После запуска отдельного стека
`ai-buddy-qa-lf` пользователь повторил прогон и получил `2 passed (788ms)`.
