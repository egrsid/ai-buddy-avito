# AI integration — дополнительные решения TL

2026-11-11 · RP-TL-AI-01 · уточнение target v2 по вопросам AI Engineer.
Решения подготовлены по поручению TL. Это документация, не выполненные схемы,
изменения Docker/CI/seed, ingest или live-подключение. Исполняемый v1 остаётся legacy.
[API](api-contracts.md), [states](state-machines.md), [AI design](ai-design.md),
[contract handoff](../team/contract-handoff.md) используют правила ниже.

## 1. Внутренние ошибки до начала SSE

Применяется к Go → AI/mock /internal/v2, кроме публичного liveness.
Порядок: проверка service token → X-Request-ID → JSON → schema/ограничения.
Ошибка до начала потока — HTTP JSON общего Error, не SSE event:
`{error:{code,message,request_id,fields?}}`, Content-Type application/json.

| Условие | HTTP / code | Правило request_id |
|---|---|---|
| Нет/неверный service token | 401 UNAUTHENTICATED | При корректном X-Request-ID вернуть его, иначе новый серверный UUID |
| Token верен, X-Request-ID отсутствует/не UUID/несколько значений | 400 INVALID_REQUEST_ID | Новый серверный UUID; неверную строку не отражать в ответе/логах |
| Некорректный JSON | 400 INVALID_JSON | Валидированный входной UUID |
| JSON не соответствует schema, scope/обязательные поля отсутствуют | 422 VALIDATION_ERROR | Валидированный входной UUID; details только safe fields |
| Аутентифицированный запрос пытается использовать выключенный mock fault mechanism | 403 FORBIDDEN | Валидированный входной UUID |

Go создаёт X-Request-ID при начале публичного запроса и передаёт его downstream.
Сервис возвращает тот же валидный ID в response header и Error; при необходимости
нового ID генерирует UUIDv4. Header принимает UUID в каноническом строковом формате,
нормализуется в lowercase; сам по себе ID не является авторизацией. Сообщения ошибок
не содержат token/SQL/provider payload или закрытых metadata.

До SSE все проверки выполняются до записи run.started/HTTP stream headers. После начала
HTTP status не меняется: ошибка идёт run.failed с безопасным code/message. Go преобразует
внутреннюю ошибку в публичный результат run, не пересылает raw HTTP/provider body.
Common Error/HTTP fixtures пишет Backend; AI internal error responses — AI Engineer.

## 2. Таймауты, heartbeat и одно завершение

Все интервалы измеряются монотонными часами соответствующего процесса.

| Контролёр | Лимит / точка отсчёта | Назначение |
|---|---|---|
| Go | 90s от queued → running | Жёсткий бюджет всего run: соединение с AI, retrieval/generation, validation/save; не продлевается heartbeat |
| Python | 85s после принятия валидного /generate | Бюджет AI pipeline, включая retrieval, provider и формирование результата; запас до внешнего лимита |
| Python provider adapter | 20s от отправки provider request до первого непустого content delta | Первый токен; headers/keepalive/tool-only служебный frame не считаются content |
| Python provider adapter | 25s после последнего непустого content delta | Простой LLM после первого токена; не сбрасывается SSE ping |
| Go upstream transport | connect 3s, idle 25s после последнего SSE frame/comment | Обрыв/зависание канала; heartbeat поддерживает транспорт, но не общий 90s deadline |
| Python → Go и Go → React | `: ping` каждые 10s при открытом stream | Комментарий SSE, без sequence ID, не текст/источник/успех |

Внутренний Python бюджет 85s заменяет прежнее неразделённое «генерация 90s» только
для AI pipeline; продуктовый предел Go 90s сохраняется. Непотоковые AI операции также
ограничены 85s, без first-token/stream-idle таймеров; caller Go использует не больший
оставшийся бюджет операции. Конкретные transport настройки/тестовые clocks выбирают авторы.

Python при provider/pipeline timeout отменяет запрос и при живом stream посылает
run.failed с code LLM_TIMEOUT. Недоступность провайдера — LLM_UNAVAILABLE.
Go страхует общий deadline: running → failed с UPSTREAM_TIMEOUT и отменяет upstream,
если валидный terminal result ещё не принят. EOF без generation.completed/run.failed —
UPSTREAM_ERROR; disconnect браузера — interrupted, явная cancel — cancelled.

Go фиксирует один терминальный переход условным update/transaction. Terminal state
не перезаписывается поздним failure/EOF/cancel/duplicate event. Completed возможен
только после успешного upstream, validation/save и проверки, что deadline не истёк.
Таймер/stream reader не создают два assistant result/action; heartbeat не запускает tools.
При failure/timeout pending actions не публикуются, partial response помечается честно.
Гонки cancel/completed/timeout проверяются Backend; provider clocks/cleanup — AI Engineer.

## 3. Управляемые mock-сбои

Unit tests внедряют fake provider/clock без HTTP и реальных долгих sleep.
Для интеграции выбран внутренний header `X-Mock-Scenario` со значениями:
normal, unavailable, timeout, slow_stream, invalid_tool. Нет header — normal.
Unrecognized value →422 VALIDATION_ERROR. Тело GenerateRequest не содержит этого поля.

Header разрешён только при всех условиях: service-auth пройдена, APP_ENV=local/test,
LLM_MODE=mock, MOCK_FAULTS_ENABLED=true. Иначе запрос с header →403 FORBIDDEN.
Флаг по умолчанию false; в live механизм выключен. APP_ENV/флаг должны быть явно
переданы AI-сервису в test configuration; отсутствие любой настройки не включает faults.
Эти настройки ещё не подключены в Compose/коде.

Public Go API не управляет header/сценарием: Go не пересылает X-Mock-Scenario браузера,
не читает `[mock:...]` из сообщения как команду. Для настоящего Go→AI integration test
служебный harness инжектирует header в backend test transport. В отдельном local/CI
запуске допустима server-side Go настройка AI_MOCK_SCENARIO из того же allowlist:
она требует local/test + включённый fault flag + mock mode; при live/production и
ненормальном значении startup завершается configuration error, не включает fault скрыто.
При normal Go вообще не отправляет X-Mock-Scenario, поэтому false-by-default флаг
не ломает обычный offline demo. MOCK_FAULTS_ENABLED=true в production/live — startup
configuration error даже при normal; явный header normal разрешён лишь тестовому harness
с включённым флагом. Конкурентные сценарии тестируются через
изолированные harness/окружения, не глобальную смену env во время активных runs.

unavailable имитирует LLM_UNAVAILABLE, timeout — LLM_TIMEOUT, slow_stream выдаёт валидные
постепенные delta для cancel/disconnect, invalid_tool — невалидное структурированное
предложение без исполнения. Имитация outcome не доказывает корректность таймеров:
отдельные fake-clock tests проверяют 20/25/85/90s. Backend/AI реализуют обе стороны,
TL подключает CI/test environment. Никакой новой задачи Fullstack на все fault cases нет.

## 4. Source.url

Внутренний AI ответ уже содержит Source[]: Python формирует относительный URL строго
по шаблону `/api/v2/knowledge/{document_id}`. Public API prefix не берётся из retrieved
контента, user input или LLM-строки. Title/excerpt/version — только разрешённого source.

Go проверяет ID/version/ACL и точное совпадение URL с шаблоном, затем сам строит
каноническую строку из валидированного document_id для сохранения/публикации.
External URL/другой ID/неверный prefix → AI_SCHEMA_INVALID, без публикации источника.
Это не даёт права открыть документ: source drawer повторно проверяет текущую ACL.
AI Engineer пишет producer/schema, Backend — validation/canonicalization; Frontend
не обращается к Python и не принимает произвольную внешнюю ссылку как KB source.

## 5. Docker, CI, ingest и UTF-8

| Вопрос | Решение TL | Автор реализации |
|---|---|---|
| Общие schemas внутри образа | Dockerfile.python должен включать contracts/ в /workspace/contracts; `$ref` разрешается локально, исходные schema-файлы доступны непривилегированному app user | TL в RP-INF-01 после поставки BE/AI schemas |
| Независимые копии DTO | JSON Schema — общий источник wire validation. Pydantic допустим как binding, генерируемый/проверяемый относительно общей schema; вторая самостоятельная схема запрещена | AI Engineer; общий registry/helper Backend |
| Python CI без PostgreSQL | Fast unit/provider tests — fake storage; отдельный compose CI step запускает AI tests с настоящим PostgreSQL/pgvector и runtime ai_service ролью | AI Engineer пишет tests, TL подключает job/runner |
| Чистый индекс | Утверждён one-shot ingest после migrate/seed и до readiness AI; CLI работает напрямую со своей kb, не ждёт поднятого AI HTTP | AI Engineer CLI; TL Compose orchestration |
| Кириллица в скриптах | Все текстовые reads/writes общих seed/migrate/check utilities явно encoding="utf-8"; content_hash считается по UTF-8 bytes | TL в RP-DATA-TL-01; автор компонента в своих файлах |
| README/.env.example/locks | Общие offline/DB настройки — TL; LLM/live embedding/budget-specific wiring/deps/locks — полностью AI Engineer по последнему поручению владельца | AI Engineer для RP-AI-02, TL вне этой области |

Сейчас COPY contracts/, ingest service, AI DB test step и явный UTF-8 в seed ещё
не реализованы; make check legacy не закрывает эти пункты. Ни Dockerfile, ни CI,
ни Python код этой документационной задачей не изменяются.

Подробные startup/CI acceptance — [development](../operations/development.md) и
[testing strategy](../testing/strategy.md). Нельзя считать smoke/verify-db тестом AI retrieval.

## 6. Live зависимости, материалы и оценка

Для MVP выбран Cloud.ru `ai-sage/GigaChat3.5-432B-A28B` без `-Reasoning`,
OpenAI-compatible adapter; live embeddings — `BAAI/bge-m3` тем же разрешённым key.
API ID и ставки/источники: [AI strategy §4/13](../AI_ENGINEERING_STRATEGY.md).
AI Engineer обеспечивает account/key/model access, оплату, env/runtime deps/locks и всю
LLM-specific интеграцию с существующим Go API, включая нужные Compose/CI/config изменения.
Это исключение из общего TL ownership: дополнительного approval TL на расходы/wiring нет;
общая offline infra/ingest/DB runner и продуктовая приёмка остаются у TL.

Бюджет 1000 ₽, автоматический stop 800 ₽ и резерв 200 ₽. До платных generation/embedding
вызовов AI резервирует верхнюю стоимость под lock в durable ledger на persistent volume;
hard output cap, учёт parallel/retry/unknown usage и сверка биллинга обязательны (§13 strategy).
Повреждение/утрата ledger после старта, неизвестный tariff или неисчислимый верхний расход —
fail closed. Превышение budget до API call → LLM_UNAVAILABLE, не новый wire error;
после SSE — run.failed, без скрытого mock completion. Далее явный offline retry.

Первые 5–10 замеров входят в примерно 10 smoke-запросов: access/usage/TTFT/schema/SSE.
Таймеры §2 (20/25/85/90s) сохраняются; heartbeat и reasoning frame не content. Не внедрять
reasoning diagnostics или GigaChat-3-Pro fallback автоматически. Ollama не требуется CI/demo.
Небольшой live eval в пределах бюджета — отдельно от обязательных offline tests.

QA response cache — опционален, полная политика [security](security.md) и strategy §13:
subject/trusted full scope/revision/index/model/prompt/schema/question, revalidation при hit,
никаких dynamic/actions/handoff/candidates; cache-off live eval. На miss не обходить budget.
Embedding index/query используют один provider/model/revision/dimension/preprocessing;
смена profile → атомарный reindex/cache invalidation/not-ready до совместимости.
Смена generation provider/key при том же embedding profile reindex не требует.
Фактическое наличие ключа, оплаты и этих механизмов ещё должно быть предъявлено AI Engineer.

Собственные synthetic DB/IAM/SSL/team/restricted/privacy документы разрешены, пометка
«не регламент Авито» обязательна. SPT/ZBP/avito-cli/Shatality без подтверждённого источника —
кейсы неизвестного, не выдуманные внутренние определения. Внешний Playbook не нужен P0:
при предложении его фрагментов AI указывает конкретный источник/условия использования,
TL принимает использование после проверки. Публикация KB по candidate остаётся human review.

Для >=20 eval cases базовая приёмка: deterministic schema/source/ACL/tool assertions и
provider-input checks плюс ручное чтение всех ответов этого небольшого набора AI Engineer.
Live отчёт готовит AI Engineer; Backend проверяет safety/tool/ACL boundaries, TL принимает
итоговый отчёт. LLM judge не обязателен и не является источником истины для safety;
добавлять платный judge можно только отдельным решением после бюджета.
Mock и live отчёты разделены; all safety cases pass, retrieval baseline >=80% expected
allowed source в top-5. Test fixtures/ручное чтение не подменяют измеренный live результат.

## 7. Что ещё требует чужой поставки или внешнего ресурса

- Backend/AI: исполняемые common/AI schemas и реальная совместимость HTTP/SSE/faults/sources;
  Frontend: consumer review; TL: финальное принятие после результатов, не заранее.
- AI Engineer: конкретные provider/model/embeddings/client, ingest CLI и DB integration tests,
  synthetic corpus/evals/report; это внутренняя реализация и выборы его области.
- AI Engineer: ключ/model access, окружение самой LLM и live-подключение, ETA и оценка расходов.
- TL: общая offline Docker/CI/UTF-8/root orchestration вне LLM-specific поставки; приёмка продукта.
  AI Engineer: расходы в пределах 1000 ₽ и вся LLM-specific интеграция без approval TL.
  Этот docs-only этап фиксирует решения, не исполняет перечисленные изменения кода.
- AI Engineer предлагает конкретные внешние материалы только при необходимости, TL
  проверяет разрешение использования; отсутствие Playbook не блокирует P0.


Документационная приёмка RP-TL-AI-01: make check — 18 tests passed, local links/legacy
contracts/seed/SQL/YAML и lint/format успешны; Markdown tables/41 RP-ID/dependency DAG и
git diff --check проверены. Только 14 Markdown-файлов, без кода/config/схем/commit/push/
переключения веток. RP-CONTRACT-01, RP-INF-01 и runtime wiring не закрыты этой приёмкой.
