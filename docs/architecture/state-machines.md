# Состояния и восстановление target v2

Версия 2.0 · проектирование; legacy todo/in_progress/done и ручной PATCH task отменены
для нового маршрута. Реализация и JSON Schema v1 ещё не обновлены.

## Step и Goal

| Переход | Условие Go |
|---|---|
| unverified → ready | Все dependencies verified, есть право выполнять method, нет открытого blocker |
| ready → verified | Успешный доверенный результат разрешённого метода, совпадают actor/resource/goal/step/version |
| ready → blocked | Проверка вернула нормализованную ошибку; сохраняются check, blocker и friction |
| blocked → waiting_external | Подтверждённая заявка submitted или подтверждённая эскалация open |
| waiting_external → blocked | Отказ, ошибка/недоступность или ответ buddy без успешной повторной проверки |
| blocked/waiting_external → ready | Причина ожидания устранена; доступна повторная проверка, но успех ещё не доказан |
| blocked/waiting_external → verified | Запрошенная повторная проверка прошла и все dependencies актуальны |
| verified → unverified/blocked | Отзыв/инвалидация evidence или prerequisite; downstream перестаёт считаться verified |

Go не принимает целевой state из клиента/AI. User claim сохраняется отдельно и отображается
«не проверено»; ручной attest не входит в технический verified P0. При отсутствии dependency
шаг unverified с причиной, не ложный ready. Отсутствие IAM grant блокирует check_access,
но не recovery action законного запроса. Ошибка инфраструктуры не означает отсутствие grant:
CHECK_UNAVAILABLE, последнее evidence сохраняется, результат помечен stale/unknown.

Evidence действует в рамках goal, subject, resource и версии шаблона. Для P0 положительные
select_resource и IAM проверки повторяются при смене scope и перед DB check. При перезапуске
до recheck UI показывает последнее состояние со временем проверки, без нового успеха.
DB check outcome неизменяем; новое наблюдение может инвалидировать старое. Отзыв IAM
снимает verified у access/connection и Goal. Нет выдуманного универсального TTL: перед
новым действием/завершением prerequisite recheck обязателен; policy revisions инвалидируют
связанный context. При отложенном старом событии результат не переписывает новый check.

Goal использует те же пять состояний: verified если все обязательные шаги verified;
иначе blocked при открытом блокере без активного внешнего ожидания, waiting_external
при активном ожидании, ready при доступном шаге, unverified до доступности/проверок.
Смешанные причины возвращаются в steps/blockers; проверенный прогресс = floor(verified*100/total),
при total=0 — 0. Пустой/некорректный обязательный маршрут не может стать verified.

## Action и внешняя операция

pending_confirmation → executing/cancelled/expired; TTL 10 минут по серверным часам.
executing → succeeded/failed/unknown; unknown → succeeded/failed только после сверки.
Preview, actor, goal/step, resource и параметры неизменяемы. Изменение отменяет старый action
и требует нового preview/confirm. При подтверждении Go повторно проверяет ACL, version,
назначение и TTL; atomic compare-and-set исключает два исполнения.
Повтор confirm возвращает существующий результат. Cancel уже cancelled идемпотентен,
исполненного/expired → 409 ACTION_NOT_PENDING. Failed не исполняется повторно тем же action.
Unknown блокирует новую эквивалентную операцию до reconcile.

Go сохраняет executing до mock write. action.id — operation_key. Таймаут или crash после
create → unknown, lookup by operation_key, при необходимости повтор строго того же payload/key.
Unique action_id и operation_key предотвращают дубли. Reconciler запускается после рестарта.
Сверка unknown не требует нового согласия на уже подтверждённый snapshot.

## AccessRequest и grant

submitted → approved/rejected только по решению access_approver в resource scope через Go.
Нет auto-approval через 15 секунд. Повтор решения с тем же ключом возвращает его; другое
решение терминальной заявки → 409. Нельзя одобрять собственную заявку.
Approved не является Evidence фактического права: grant_state absent/pending/present
проверяется отдельным IAM read, ошибка даёт unknown и sync_status=unavailable.
Resource_access_granted от mock принимается только после серверной сверки; без grant
check_connection не запускается. Succeeded action означает создание заявки, не выдачу прав.

## Verification, Blocker, Friction

Check queued → running → passed/failed/unavailable. Клиент просит проверку method/options,
не присылает outcome/event. Результат trusted adapter связывает с check_id; один результат
применяется один раз. Failed создаёт blocker и Friction Event; unavailable отмечает сбой
сервиса, не гипотезу ошибки документа. Разрешённые ошибки, включая DB_SSL_REQUIRED,
нормализуются Go. Blocker open → resolved только при evidence устранения причины.
Buddy может предложить решение и закрыть обращение; это не technical resolution blocker.

Friction group = journey_id + step_id + error_code; учитываются distinct intern_id только
в одной разрешённой области, attempt_id/event_id дедуплицируются. Порог >=2. Версии
инструкции/маршрута и время сохраняются; один unique candidate на группу в P0, новые
наблюдения обновляют count, не публикуют и не создают новую карточку после rejected/resolved.
Новая политика повторного открытия/версий — P1/TL; первая демонстрация в одной версии.

## Knowledge Gap Candidate

proposed → under_review → accepted/rejected; accepted → resolved.
Рассмотрение и решение только assigned documentation_owner, version conflict → 409.
Accepted — согласие с гипотезой, не обновление KB. Resolved требует ссылки на проверенную
человеком исправленную версию; публикация вне автоматического pipeline. Неизвестный source
не создаётся AI. При сбое AI сохраняется карточка с enrichment_status=pending/failed,
детерминированным safe описанием и возможностью безопасного retry. Повтор enrichment
не создаёт второй candidate. Журнал review хранится минимально для аудита; расширенная история P1.

## Escalation

open → resolved атомарной записью непустого ответа назначенного buddy.
Стажёр подтверждает точный diagnostic snapshot; смена получателя/ACL до confirm требует
нового preview. Перед чтением/ответом права проверяются снова; revoked refs редактируются
в представлении без раскрытия закрытого содержимого. Ответ идемпотентен по ключу,
иной ответ в resolved → 409. Ответ/KB не публикуются автоматически.

## Run и SSE

queued → running → completed/failed/cancelled/interrupted. Один активный run на диалог.
POST создаёт user message + run; GET events атомарно запускает queued один раз, второй
subscriber → 409 RUN_ALREADY_STARTED. Без подписки 30s → STREAM_NOT_OPENED.
При disconnect Go отменяет upstream и сохраняет interrupted/partial; после рестарта
незавершённые runs interrupted. Частичный ответ не передаётся в следующий prompt.
Proposals публикуются только после successful generation.completed, проверки и app commit.
Retry — явный POST с retry_of того же пользователя/контекста и прежним user message;
старые pending proposals отменяются, user message не дублируется.
EventSource onerror → close + GET run/messages. Replay Last-Event-ID не поддерживается.

## Таймауты и polling

Connect 3s; mock 5s; LLM first token 20s; run 90s; idle stream 25s; heartbeat 10s.
SSE WriteTimeout отключён, отмена через context. GET максимум два retry 0.5/1s, не 4xx.
Write retry только с тем же operation key/payload. Goal/check/request/escalation/candidate и
executing/unknown action читаются каждые 5s в активной вкладке и после мутаций;
terminal action прекращает polling. Polling не принимает решение approver и не запускает новый check.
