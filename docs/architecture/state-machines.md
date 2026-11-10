# Состояния и восстановление v1

## Задача

todo → in_progress/blocked/done; in_progress → todo/blocked/done;
blocked → todo/in_progress/done; done → in_progress (явное повторное открытие).
PATCH требует текущий version; устаревшая версия → 409 VERSION_CONFLICT.
Прогресс = done / число задач; при отсутствии задач 0. Создание/одобрение заявки не завершает задачу.

## Предложение AI

pending_confirmation → executing/cancelled/expired. TTL 10 минут по серверным часам.
executing → succeeded/failed/unknown. unknown → succeeded/failed после сверки.
Параметры и preview неизменяемы; редактирование отменяет старое предложение и создаёт новое.
Go проверяет тип, схему, ресурс, права, пользователя, expires_at до исполнения.
Подтверждение и перевод в executing — атомарный compare-and-set в транзакции.
Повтор confirm возвращает текущее состояние, не вызывает новую операцию.
Повторный cancel терминального действия → 409 ACTION_NOT_PENDING.
failed не исполняется снова: только новое предложение с новым подтверждением.
unknown запрещает автоматическое новое предложение для той же операции до сверки.

Для доступа action.id становится Idempotency-Key mock API. Go сначала сохраняет executing,
потом вызывает mock, затем сохраняет результат. Таймаут → unknown, lookup по operation_key.
После рестарта worker сверяет executing/unknown; повторный create допускается только с тем же
ключом и payload. Конфликт ключа и payload → 409. Уникальность operation_key в corporate и
action_id в app.access_requests предотвращает дубли даже при сбое между двумя записями.
Для эскалации/смены статуса действие и результат фиксируются одной app-транзакцией.

## Заявка

submitted → approved/rejected. Draft/confirmation/executing/failed — состояния предложения,
не самой заявки. Внешний ID и operation_key обязательны для submitted.
Mock при создании возвращает submitted; повторное создание с тем же ключом возвращает ту же заявку.
В локальном demo через 15 секунд status endpoint детерминированно переводит заявку в approved;
ресурс sandbox/restricted всегда даёт rejected. Это имитация, реального доступа нет.
Go синхронизирует статус при GET и сохраняет локально; ошибка опроса не стирает последнее
состояние, ответ включает sync_status=unavailable и updated_at.

## Обращение

open → resolved только атомарной записью непустого ответа назначенного buddy.
Повтор ответа с тем же Idempotency-Key возвращает исходный ответ; другой ответ в resolved → 409.
Редактирование/переоткрытие вне MVP. Стажёр подтверждает точный snapshot question/summary/source_ids.
Смена назначения buddy требует нового подтверждения ещё не исполненного предложения.

## Генерация

queued → running → completed/failed/cancelled/interrupted. Один активный run на диалог.
Запуск подписки: queued → running атомарно; повторный subscriber → 409 RUN_ALREADY_STARTED.
Неоткрытая подписка через 30 секунд → failed с STREAM_NOT_OPENED.
user message сохраняется до run. assistant со статусом completed/failed/cancelled/interrupted
сохраняется Go, в том числе частичный текст. Частичный текст не передаётся в следующий prompt.
При disconnect Go отменяет upstream, сохраняет interrupted. После рестарта незавершённые runs
становятся interrupted. Предложение действия допускается только после успешной полной генерации
и валидации: при failed/interrupted новые pending actions не публикуются.

Frontend не переподключает EventSource автоматически: onerror → close, GET run/messages.
Повтор генерации — явная кнопка, новый run с retry_of, тем же user message, без дублирования текста.
Предыдущий run должен быть терминальным; его pending-предложения отменяются до повторной генерации.
SSE не воспроизводится по Last-Event-ID. Восстановление — через сохранённые REST-данные.

## Таймауты

Внутренний connect 3s; mock 5s; LLM first token 20s; общая генерация 90s; idle stream 25s.
SSE heartbeat каждые 10s; Go stream WriteTimeout отключён для SSE, отмена через context.
Автоповтор write-запросов запрещён, кроме строго идемпотентной сверки с тем же ключом.
Обычный GET можно повторить максимум дважды с задержками 0.5/1s. Не повторять 4xx.
Списки заявок/обращений и executing/unknown actions опрашиваются каждые 5s только
в активной вкладке и после мутаций; terminal action прекращает polling.
