# AI Engineering Strategy

## Уточнение владельца · 13 ноября 2026

Текущее live-решение: `GigaChat/GigaChat-3-Pro` →
`ai-sage/GigaChat3.5-432B-A28B` → детерминированный offline provider.
Название «GigaChat3.5Pro» не является проверенным API ID; Pro ID подтверждён
уже поставленным AI smoke. [Каталог Cloud.ru](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models)
и фактические AI reports — разные виды evidence; доступ конкретного аккаунта проверяется отдельно.
Прежнее решение о единственной модели/только ручном offline retry заменено этим поручением.

В TL integration checkout это реализовано поверх существующего OpenAI adapter,
общего budget ledger и mock_answer. Primary — LLM_MODEL, secondary — LLM_FALLBACK_MODEL,
цены secondary задаются отдельно; unknown usage сохраняет резерв, budget refusal
не вызывает вторую платную модель. Максимум две live-попытки: до 6s на первый фрагмент, полный ответ буферизуется
до EOF в общем first-content deadline 20s с запасом для следующей модели.
Pipeline 85s/Go 90s не расширены. Неудачная модель и query embeddings пропускаются
30s; прерванный ответ не попадает в историю. Актуальная поставка AI 25ac58f.
Сохраняются верхние лимиты 20/25/85/90s, ACL/retrieval/source validation и Go ownership.
В degraded ответе нет tool.proposed; явные Go actions/preview/confirm остаются доступны.

В чат через обычный message.delta всегда попадает: «Произошла ошибка обращения к LLM.
Работает fallback. Обратись к своему наставнику напрямую для решения вопроса».
При offline recovery явно сказано, что ответ подготовлен без LLM. Go сохраняет его
как завершённый резервный ответ; ошибочный partial исходной модели отброшен.
Публичные схемы не расширяются. Mock mode не делает live attempts и не сообщает
о выдуманном сбое. Structured операции остаются детерминированными.

Независимые component/API/DB/fault/restart результаты и оставшиеся FE/clean-build/live
gates — [TL record](team/tl-readiness.md). Это не финальная browser/live приемка.

**Проект:** Avito AI-buddy — Hack&Change 2026  
**Версия:** 2.3 · GigaChat3.5-432B-A28B, бюджет и безопасная экономия
**Дата:** 12 ноября 2026  
**Статус:** AI implementation reference; продуктовые требования — Product Spec v2
**Рекомендуемый путь:** `docs/AI_ENGINEERING_STRATEGY.md`

---

## 1. Назначение

Этот документ фиксирует технические решения для AI-подсистемы Avito AI-buddy и служит основой для актуализации рабочего плана AI Engineer.

Он описывает:

- выбор LLM и резервных моделей;
- архитектуру RAG;
- интеграцию LLM с backend;
- безопасную обработку корпоративных данных;
- structured output и tool calling;
- тестирование качества, стоимости и производительности;
- приоритеты и зависимости инженерных задач.

Документ предназначен для реализации проекта, а не для презентации исследования.

### Источники решений

1. [Product Spec v2](product/specification.md) и [replanning brief](../CODEX_PROJECT_REPLAN.md) — утверждённый scope Engineering Onboarding & Feedback Loop.
2. [Architecture](../ARCHITECTURE.md), [AI design](architecture/ai-design.md), [AI integration policy](architecture/ai-integration-policy.md) — границы и протоколы.
3. [Восемь SDD](features/README.md), [backlog](team/backlog.md) и [AI handoff](team/assignments/ai-engineer.md) — задачи, владельцы и приёмка.

Прежняя ссылка на `AVITO_AI_BUDDY_PRODUCT_SPEC.md` удалена: такого файла в репозитории нет.
Упомянутые в исходной редакции `Авито_кейс.pdf`, `Avito AI deep research.docx`,
`созвоны.docx` и `Выбор LLM для Avito AI.docx` не предоставлены в репозитории;
их пересказ не подтверждает требования или текущие возможности провайдера.

При противоречии между идеями из исследований и утверждённой продуктовой спецификацией приоритет имеет product spec.

**Этот документ заменяет предыдущие предварительные рекомендации, в которых YandexGPT предлагался как основной LLM.**

Решение владельца от 12.11.2026: основная LLM MVP — **GigaChat3.5-432B-A28B**,
API ID `ai-sage/GigaChat3.5-432B-A28B`, без суффикса `-Reasoning`.
Предыдущее название «GigaChat 3.5 Pro» исправлено; блокер неизвестного ID снят на уровне
документации, но доступ ключа/качество/таймауты требуют фактического live smoke.
Бюджет хакатона — **1000 ₽**, начальный автоматический stop — **800 ₽** (§13).
AI Engineer обеспечивает ключ, окружение, расходы и всю LLM-интеграцию без approval TL.
Назначения/policy/backlog синхронизированы с этим решением. A-Vibe остаётся перспективой
после MVP. Продуктовые S1–S4, DB journey, feedback loop и security gates сохраняются;
никакая документационная правка не подтверждает реализацию адаптера/лимитера/кэша.

---

## 2. Ключевое архитектурное решение

Avito AI-buddy не должен быть автономным AI-агентом, который самостоятельно принимает решения о доступах и изменяет состояние корпоративных систем.

Целевая архитектура:

**Deterministic backend + ACL-aware RAG + non-reasoning LLM + validated actions + human handoff.**

Распределение ответственности:

| Компонент | Ответственность |
|---|---|
| Go backend | Авторизация, ACL, состояния onboarding, бизнес-правила, выполнение действий, аудит |
| Python AI service | RAG, интеграция LLM, обработка естественного языка, structured output |
| PostgreSQL | Документы, метаданные, состояния, аудит |
| pgvector | Векторный поиск |
| React / TypeScript | Пользовательский интерфейс |
| Mock enterprise API | Имитация корпоративных действий |

**Принцип:** LLM предлагает и объясняет. Backend проверяет и выполняет.

Для MVP достаточно Cloud.ru API и адаптера `LLMProvider`; собственные GPU/vLLM,
Redis, LLM gateway, reasoning-router и второй live-провайдер не требуются.
Собственный serving A-Vibe рассматривается после MVP (§4.3, §6).

---

## 3. Продуктовый scope

### Один обязательный путь P0

Цель → разрешённое действие → доверенная проверка → blocker/диагностика → buddy →
повторяющаяся проблема → Knowledge Gap Candidate → review человеком.
Ни RAG, ни отправленная заявка сами по себе не завершают P0.

Обозначения S1–S4 ниже — локальные названия частей этого пути, не возврат старого
scope из четырёх независимых сценариев. Критерии задаёт [Product Spec §4–8](product/specification.md).

**S1. Context-aware documentation assistant**

Пользователь задаёт вопрос об инженерной документации, внутренних процессах или терминах.

Система должна:

- искать информацию в разрешённых документах;
- учитывать контекст пользователя;
- возвращать объяснение;
- показывать проверяемые ссылки на источники;
- признавать отсутствие достаточных данных.

**S2. Interactive onboarding**

Пользователь видит текущий этап адаптации, зависимости, выполненные шаги и блокеры.

LLM объясняет состояние, но не является источником истины о прогрессе.

**S3. Test DB access and trusted verification**

Пользователь получает доступ к синтетической тестовой БД команды и проверяет подключение.
Это ресурс отдельного corporate mock, не внутренняя PostgreSQL приложения.

Система:

1. Go выбирает разрешённый утверждённый JSON journey и проверяет mock IAM.
2. Если grant отсутствует, AI формирует draft ресурса, роли и основания; уточняет недостающие поля.
3. Go валидирует draft и права, подставляет actor из сессии; React показывает точный preview.
4. Intern явно подтверждает отправку; Go идемпотентно создаёт mock-заявку.
5. Отдельный scoped access_approver одобряет или отклоняет её; intern и таймер не выдают доступ.
6. После approval Go повторно читает IAM grant. Approved без grant означает ожидание.
7. Intern запускает фиксированный безопасный DB check без произвольного SQL/DSN.
8. Ошибка `DB_SSL_REQUIRED` сохраняется Go как check/blocker/friction; AI объясняет следующий допустимый шаг.
9. После buddy и настройки `ssl_mode=require` выполняется повторная проверка.
   Только trusted passed result вместе с актуальным grant позволяет Go выставить verified.

**S4. Human handoff**

AI готовит диагностику goal/step/checks/errors/attempts/instructions и гипотезу.
Go проверяет пересечение ACL intern/buddy, показывает точный snapshot и отправляет
его только после подтверждения intern. Ответ назначенного buddy не заменяет DB recheck.

### Reverse Onboarding — обязательное продолжение P0

- Go группирует friction по `journey_id + step_id + error_code` в разрешённой team/resource области.
- Порог — два разных стажёра: intern-a и intern-b команды A получают `DB_SSL_REQUIRED` на одном шаге.
  Много попыток одного intern и повторы доставки не достигают порога повторно.
- Go дедуплицирует события и создаёт один Knowledge Gap Candidate на группу.
- Python получает только безопасный агрегат и готовит гипотезу пробела/исправления;
  не получает IDs людей, сырые логи, PII или всю переписку. Повтор ошибки не доказывает дефект инструкции.
- При AI-сбое остаётся минимальная детерминированная карточка Go для review.
- Scoped documentation_owner рассматривает шаг, версию инструкции, код ошибки, distinct count и гипотезу.
  Accepted не публикует изменения; resolved требует ссылки на проверенную человеком новую версию.

Четыре P0-роли: intern, buddy, access_approver, documentation_owner; HR вне MVP.
Intern-c команды B, другой ресурс и restricted documents проверяют отрицательные ACL.
[Reverse Onboarding SDD](features/reverse-onboarding/spec.md), [demo A/B/C](product/demo.md).

### Вне обязательного MVP

- автономное выполнение произвольных действий;
- доступ к реальным корпоративным системам;
- обучение собственной LLM;
- сложный multi-agent framework;
- полноценная HR-функциональность;
- автоматическое изменение корпоративной документации;
- репозиторный сценарий как замена обязательному DB journey;
- собственный serving A-Vibe, расширенный RAG и embeddings как условие готовности offline P0.

Основной live-провайдер MVP — GigaChat3.5-432B-A28B без reasoning (§4.1);
обязательный offline P0 воспроизводится отдельно без ключа/сети и не выдаётся за live-проверку.

---

## 4. Выбор основной LLM

### 4.1. Принятое направление

**Основная LLM MVP: GigaChat3.5-432B-A28B через Cloud.ru API.**
Точный API ID: **`ai-sage/GigaChat3.5-432B-A28B`**.
[Официальная таблица Cloud.ru](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models)
указывает этот ID, Function Calling и Structure Output без отметки Reasoning.
[Каталог Cloud.ru](https://cloud.ru/products/evolution-ai-factory/catalog-foundation-models)
разделяет обычную модель и запись с `-Reasoning`.

Предположение AI Engineer о reasoning в основной модели относится к другой записи.
Суффикс `-Reasoning` не добавлять, скрытые токены не предполагать и не оценивать цену
выбранной модели с множителем 2–5 без данных. Расход считать по полному billable usage,
сверенному с биллингом; при неизвестном usage — консервативное резервирование (§13).
Reasoning-модель не используется ни в чате, ни в классификации/диагностике MVP.

AI Engineer проверяет доступ ID для своего ключа через список моделей и первые 5–10
live-запросов: usage, первый content token, полный ответ, schema/tools/cancel и тариф.
Это входит в первые примерно 10 smoke-вызовов, не отдельная дополнительная серия.
GigaChat-3-Pro — возможный последующий эксперимент, если замер выбранной модели не
укладывается в SLA; автоматической подмены или разделения chat/diagnostics сейчас нет.
Проверка/настройка параметров выбранного endpoint — AI Engineer, без ожидания approval TL;
переход на другую основную модель требует явного обновления решения, а не скрытого fallback.

### Почему это направление

1. Один управляемый API вместо собственного inference-кластера в MVP.
2. Русскоязычные объяснения инструкций, RAG-ответы и короткие структурированные drafts.
3. Отсутствие отдельного этапа reasoning и маршрутизации на тяжёлые модели.
4. Единый адаптер для streaming, structured output и нормализованных ошибок.

Качество русского, latency, tool arguments и schema compliance проверяются на сценариях
проекта. Тариф/контекст/benchmarks относятся к точному API ID; свойства Reasoning
или GigaChat-3-Pro не переносятся на выбранную модель.

### 4.2. Статус выбора и альтернатив

| Модель / режим | Роль | Условие |
|---|---|---|
| GigaChat3.5-432B-A28B, Cloud.ru | Основная LLM MVP | ID установлен; доступ ключа, 20s TTFT, usage и качество проверяет AI Engineer |
| Deterministic offline provider | Обязательный fallback MVP | Полные S1–S4 и candidate draft, без сети/ключа; явно обозначенный mock |
| Другой live provider | После MVP, по измерениям | Не часть обязательного failover и не скрытая замена основной модели |
| A-Vibe от AvitoTech | Перспектива после MVP | Отдельная оценка качества, serving, безопасности и TCO |

Предыдущий ranking reasoning-моделей и их тарифы больше не определяют архитектуру MVP.

**Прямой GigaChat API Сбера — только резервный вариант, адаптер сейчас не писать.**
[Тарифы Сбера](https://developers.sber.ru/docs/ru/gigachat/tariffs/individual-tariffs)
описывают freemium для физлиц, в том числе 50 млн токенов `GigaChat-3-Ultra` на 12 месяцев;
это другая модель/площадка, не API ID выбранной Cloud.ru модели.
[Access token действует 30 минут](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/post-token),
для физлиц [по умолчанию один поток](https://developers.sber.ru/docs/ru/gigachat/limitations).
AI Engineer проверяет доступность/условия freemium для своего аккаунта и demo,
обновление token, совместимость tools/streaming и доверенную TLS-цепочку; TLS verification
не отключать. Этот вариант не блокирует MVP и не является автоматическим failover.

### 4.3. A-Vibe: перспектива интеграции после MVP

Официальная [карточка AvitoTech/avibe](https://huggingface.co/AvitoTech/avibe) описывает
адаптацию модели под русский язык и домен Авито и содержит пример запуска через vLLM
с OpenAI-compatible Chat Completions API. Это основание для будущего эксперимента,
а не подтверждение готового endpoint или качества на наших onboarding-сценариях.

**Потенциальная ценность:** собственная модель Авито может упростить развитие продукта
внутри инфраструктуры компании: размещение генерации в контролируемом контуре,
согласование с внутренними эксплуатационными практиками и адаптация под инженерные
инструкции. Это архитектурная возможность, не утверждение об имеющихся GPU, доступах,
одобрении Авито или реализованной интеграции.

После MVP AI Engineer проверяет условия использования, ресурсы/стоимость serving,
качество S1–S4, streaming, structured output и tools на том же eval-наборе.
До такой проверки A-Vibe не является production fallback и не требует GPU/vLLM в MVP Compose.

---

## 5. Стратегия маршрутизации запросов

В MVP один live-провайдер без reasoning; детерминированные операции остаются в Go.

### Tier 0 — Deterministic path

Без LLM обрабатываются:

- получение текущего статуса onboarding;
- отображение выполненных задач;
- проверка прав;
- проверка статуса заявки;
- простые переходы состояния;
- подтверждение действия.

Реализация: Go backend.

### Tier 1 — Normal RAG

Основная модель: `ai-sage/GigaChat3.5-432B-A28B` через Cloud.ru API, без reasoning.

Сценарии:

- вопросы по документации;
- объяснение терминов;
- разбор инструкций;
- объяснение blockers;
- подготовка структурированных черновиков.

### Tier 2 — После MVP

Отдельный reasoning tier и автоматическая маршрутизация по сложности в MVP не нужны.
При неоднозначной инструкции AI уточняет вопрос, показывает разрешённые источники
или готовит buddy handoff. A-Vibe оценивается после MVP через тот же `LLMProvider`,
без изменения правил доступа и маршрутов.

### Provider fallback

В MVP при недоступности/timeout основной модели возвращается нормализованная ошибка,
а пользователь может явно повторить запрос в deterministic offline режиме или обратиться
к buddy. Автоматический переход на Alice AI, reasoning-модель или A-Vibe не требуется.

Требования:

- один provider на run, без смешивания live/mock токенов;
- после начала SSE — failed и явный retry в выбранном режиме;
- ограниченные transport retries до stream, без повторного исполнения action;
- те же ACL, schema validation, confirmation и аудит в любом режиме;
- fallback покрывает S1–S4, диагностику и candidate draft, а не только чат-заглушку.

**Offline P0** остаётся воспроизводимым без сети/ключа. Live-поставка основной модели
для MVP проверяется отдельно; успешный mock не считается проверкой live API/качества.

---

## 6. Provider abstraction

Бизнес-логика не должна зависеть от конкретного SDK или названия модели.

Рекомендуемый интерфейс:

```python
from typing import Protocol

class LLMProvider(Protocol):
    async def generate(
        self,
        messages: list,
        response_schema: dict | None = None,
        tools: list | None = None,
    ) -> "LLMResponse":
        ...
```

Cloud.ru подключается через OpenAI-совместимый адаптер `openai` с настроенным base URL;
создавать отдельный framework или менять Go/React/API/data ownership для этого не требуется.
AI Engineer проверяет совместимость выбранного endpoint: auth, streaming, model ID,
structured outputs и tools. Исследовательская рекомендация не считается проверкой API.
Второй provider adapter добавляется только при необходимости в P1.

### Конфигурация

```env
LLM_MODE=live
LLM_BASE_URL=https://foundation-models.api.cloud.ru/v1
LLM_MODEL=ai-sage/GigaChat3.5-432B-A28B
LLM_API_KEY=<secret-in-local-environment-only>
```

Base URL подтверждён [быстрым стартом Cloud.ru](https://cloud.ru/docs/foundation-models/ug/topics/quickstart).
Model ID проверен документально (§4.1); ключ хранится только в secret/env AI-service.
Offline запускается явно через `LLM_MODE=mock` без provider calls. Имена настроек
сохраняются; runtime config этой правкой не меняется. Настройки budget ledger/лимитов
и точные env names поставляет AI Engineer вместе с реализацией, не фиктивным wiring.
Жёсткий output cap обязателен: стартовый `max_tokens=1000` на вызов, `n=1`;
если endpoint требует `max_completion_tokens`, адаптер использует проверенный эквивалент.
Это ограничение, а не длина каждого ответа; усечение/невалидный JSON не создаёт action.
Не включать непроверенные thinking-параметры и не менять модель на Reasoning.

**Таймауты сохраняются:** первый непустой content delta — 20s, idle — 25s,
AI pipeline — 85s, внешний Go run — 90s. Первые 5–10 вызовов измеряют TTFT и полный
latency; этого мало для устойчивого p95, все отдельные замеры и timeout долю сохранить.
Heartbeat/headers/скрытое рассуждение не считаются первым content token. Если выбранный
endpoint нарушает предел, возвращать `LLM_TIMEOUT`, очищать provider request, предлагать
явный offline retry; не продлевать таймауты и не подменять модель автоматически.
Непотоковые classification/diagnostics сохраняют deadline 85s/оставшийся бюджет Go.

### Подключение A-Vibe после MVP через тот же LLMProvider

```text
Go -> Python: разрешённый контекст
        -> ACL retrieval / RAG -> LLMProvider
                                  -> openai adapter -> Cloud.ru API (MVP)
                                  -> openai adapter -> свой A-Vibe endpoint (после MVP)
        <- text / structured result / normalized errors
Go: validation -> preview/confirm -> business action
```

Для будущего A-Vibe backend serving может быть vLLM: карточка модели показывает
`vllm serve "AvitoTech/avibe"`; [сервер vLLM](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/)
поддерживает Chat Completions. Адрес собственного сервера с `/v1`, доступ и served model ID
задаёт AI Engineer; готового внутреннего endpoint Авито сейчас нет в поставке.

Меняются `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` и при необходимости настройки
chat template/tools/response format внутри адаптера. `LLMProvider` сохраняет единый результат.
OpenAI-совместимость транспорта не гарантирует поддержку всех возможностей: проверить
streaming, tool parser, отмену/таймауты и [structured outputs vLLM](https://docs.vllm.ai/en/latest/features/structured_outputs/).
Python и Go продолжают валидировать JSON независимо от constrained decoding.
RAG, ACL-фильтрация, embeddings/index, Go state machine и React API от модели не зависят;
замена generation provider сама по себе не требует reindex или переписывания бизнес-логики.
Развёртывание serving/защищённого endpoint остаётся отдельной работой после MVP.

### Кто обеспечивает ключ, окружение, расходы и интеграцию

**AI Engineer полностью владеет LLM-поставкой:** сам получает account/key/model access,
готовит окружение, подключает Cloud.ru через адаптер, настраивает env/deps, transport,
streaming, ошибки, LLM-specific wiring и интеграционные tests с Go по существующему API.
Общую интеграцию LLM, включая нужные изменения Compose/CI/config/locks для этого
подключения, он доводит до работающего результата сам и передаёт проверенную поставку.
Это явное исключение владельца для LLM-части общих файлов; остальная инфраструктура
и бизнес-логика Go/React сохраняют своих владельцев.

**Расходы также полностью на AI Engineer:** он обеспечивает бюджет/оплату, выбирает
рабочий лимит, контролирует usage и стоимость spike/evals/demo. Дополнительного
подтверждения TL для этих расходов или LLM-интеграции не ждёт; сообщает фактический
результат, ETA и блокеры, а не запрашивает разрешение начать свою часть.
Плановый бюджет 1000 ₽ и stop 800 ₽ определены; фактическое пополнение счёта,
готовность live-окружения и срок поставки этой документацией не подтверждены. При недоступности ресурса AI Engineer разбирается с провайдером
и сохраняет рабочий offline path. TL сохраняет scope/контракты/security и итоговую
приёмку продукта; обязательного approval gate TL на LLM-расходы/подключение больше нет.

### Нормализованный результат

LLM adapter должен возвращать:

- текст ответа;
- структурированные данные, если запрошены;
- статус завершения;
- model ID;
- usage tokens, если доступно;
- latency;
- нормализованные ошибки.

Все JSON-ответы должны валидироваться на стороне приложения.

---

## 7. RAG-архитектура

Обязательный P0 baseline — воспроизводимые ACL/chunks/lexical retrieval и проверенные
sources без сети/ключа по AI design. Live embeddings — Cloud.ru BAAI/bge-m3; hybrid/reranking — P1;
они не заменяют DB verification и feedback loop и не являются условием offline P0.

### 7.1. Общая схема

```text
Synthetic documents
        |
        v
Ingestion / Parsing
        |
        v
Metadata + ACL
        |
        v
Semantic chunking
        |
        v
Embedding generation
        |
        v
PostgreSQL + pgvector
        |
        v
User question
        |
        v
Authorized retrieval
        |
        v
Hybrid search
        |
        v
Reranking
        |
        v
Evidence package
        |
        v
LLM generation
        |
        v
Citation + schema validation
        |
        v
User response
```

### 7.2. Документы

Для каждого документа сохранять:

- `document_id`;
- `title`;
- `source`;
- `version`;
- `updated_at`;
- `section`;
- `owner`;
- `acl_groups`;
- `content_hash`.

Для каждого chunk:

- `chunk_id`;
- `document_id`;
- `section_path`;
- `content`;
- `embedding`;
- `metadata`.

### 7.3. Chunking

Использовать структурный chunking:

- по разделам;
- по процедурам;
- по инструкциям;
- по prerequisites;
- с сохранением заголовков и источников.

Не разбивать документы только по фиксированному количеству символов.

Размер chunk и overlap являются параметрами для экспериментов, а не заранее доказанными оптимальными значениями.

### 7.4. Embeddings

Для live RAG выбран **Cloud.ru `BAAI/bge-m3`** через тот же Foundation Models key
с нужными разрешениями; доступ embedding endpoint проверяет AI Engineer.
ID — из [официальной таблицы моделей](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models),
ставка каталога — **0,61 ₽ за 1M входных токенов**. Генерация, индексирование и query
embeddings входят в один бюджет §13. Это не подключение Managed RAG или отдельного сервиса.

Документы и запросы кодируются одним embedding profile: provider/endpoint, model/revision,
фактическая dimension, нормализация/preprocessing. AI Engineer измеряет dimension и
фиксирует профиль в метаданных индекса; несовпадение — not ready, не смешанный поиск.
При смене embedding provider/model/revision/dimension/preprocessing индекс пересобирается
атомарно, затем переключается readiness и сбрасываются зависимые кэши. Смена только
ключа при том же profile или generation LLM не требует reindex. Размерность меняется
новой миграцией владельца kb при необходимости, applied DDL не переписывается.

Для live-демо организаторам не нужна Ollama: достаточно проверенного Cloud.ru key,
конфигурации и подготовленного совместимого индекса. Без сети/ключа обязателен отдельный
lexical/deterministic offline режим, без model download; он не называется vector/live RAG.

### 7.5. Vector storage

**Рекомендуемое решение: PostgreSQL + pgvector.**

Причины:

- PostgreSQL соответствует стеку проекта;
- не требуется отдельный сервис;
- удобно хранить метаданные и ACL;
- достаточно для синтетического корпуса MVP.

Qdrant не добавлять без подтверждённой необходимости.

### 7.6. Hybrid retrieval

Использовать:

1. Semantic retrieval через embeddings.
2. Lexical retrieval через PostgreSQL Full Text Search.
3. Объединение результатов через RRF.
4. Reranking разрешённых кандидатов.

Lexical retrieval важен для:

- названий репозиториев;
- сокращений;
- кодов ошибок;
- названий внутренних сервисов;
- точных технических терминов.

PostgreSQL FTS не следует называть BM25 без отдельной реализации BM25.

### 7.7. Reranking

Кандидат: Qwen3 Reranker или multilingual BGE reranker.

По исследованию стоимость Qwen3 Reranker на Cloud.ru составляет около 0,854 ₽ / 1M токенов.

Рекомендуемый начальный эксперимент:

- получить до 20 разрешённых кандидатов;
- выполнить reranking;
- передать 5–10 наиболее релевантных chunks в evidence package.

Эти значения являются стартовыми параметрами для тестирования.

---

## 8. Безопасность и ACL

**ACL — обязательное серверное ограничение, а не инструкция для LLM.**

Правила:

1. Пользователь аутентифицируется на backend.
2. Backend определяет его роли и разрешения.
3. Retrieval применяет ACL до формирования candidate set.
4. Reranker получает только разрешённые chunks.
5. LLM получает только разрешённый evidence package.
6. Ответ не должен раскрывать содержимое или наличие запрещённых документов.
7. Действия повторно авторизуются непосредственно перед выполнением.

Нельзя:

- сначала извлекать все документы и фильтровать их только после генерации;
- просить модель самостоятельно решать, какие документы пользователь вправе видеть;
- использовать system prompt вместо ACL;
- доверять инструкциям, содержащимся в retrieved documents;
- передавать секреты в логи или traces.

Все демонстрационные данные должны быть синтетическими.

---

## 9. Grounded generation

### 9.1. Evidence package

LLM получает только разрешённые фрагменты вместе с идентификаторами источников.

Пример:

```json
{
  "sources": [
    {
      "document_id": "onboarding-001",
      "chunk_id": "chunk-007",
      "title": "Test DB connection guide",
      "version": "2.0",
      "section": "Request procedure",
      "content": "..."
    }
  ]
}
```

### 9.2. Ответ модели

```json
{
  "status": "answered",
  "answer": "Для доступа необходимо создать заявку...",
  "citations": [
    {
      "document_id": "onboarding-001",
      "chunk_id": "chunk-007"
    }
  ],
  "next_action": null
}
```

Допустимые статусы:

- `answered`;
- `insufficient_evidence`;
- `conflicting_sources`;
- `needs_clarification`.

### 9.3. Проверка ответа

Backend или AI orchestration layer должен:

- проверять JSON schema;
- проверять существование citation IDs;
- проверять принадлежность цитат разрешённому evidence;
- отклонять ссылки на несуществующие источники;
- поддерживать безопасный отказ при отсутствии данных.

Важно различать наличие ссылки и фактическую поддержку утверждения источником.

---

## 10. Engineering Readiness Graph

Продуктовая ценность системы не ограничивается поиском документов.

Основная логика:

**Goal → Prerequisites → Trusted Evidence → Blocker → Next Safe Action → Human Handoff → Repeated Friction → Knowledge Gap Candidate → Human Review**

### Представление данных

Для каждого этапа onboarding хранить:

- `goal_id`;
- `prerequisites`;
- `required_evidence`;
- `current_status`;
- `blockers`;
- `available_actions`;
- `escalation_conditions`.

Пример:

```text
Goal: Connect to the synthetic test DB
  Prerequisite: Approved JSON journey and permitted resource
  Access evidence: Trusted IAM grant recheck (approval alone is insufficient)
  Result evidence: Trusted passed DB connection check
  Blocker: DB_SSL_REQUIRED
  Next action: Safe recheck with ssl_mode=require
  Handoff: Previewed ACL-filtered diagnosis for assigned buddy
  Feedback: Two distinct interns -> one candidate -> documentation owner review
```

### Распределение логики

Go backend:

- определяет состояние;
- проверяет зависимости;
- фиксирует evidence;
- разрешает переходы.

LLM:

- объясняет состояние;
- помогает разобраться с блокером;
- формирует следующий безопасный шаг;
- готовит контекст для наставника.

LLM не должна самостоятельно отмечать задачи выполненными без подтверждённого evidence.

---

## 11. Structured actions и tool calling

### 11.1. Принцип

LLM формирует предложение действия, но не выполняет его самостоятельно.

Для S3 использовать следующий процесс:

```text
User request
    |
    v
Intent extraction
    |
    v
Required fields validation
    |
    v
Draft action
    |
    v
User confirmation
    |
    v
Backend ACL check
    |
    v
Mock API execution
    |
    v
Audit + persisted request
    |
    v
Separate scoped approval -> IAM grant recheck -> safe DB check
    |
    v
DB_SSL_REQUIRED -> blocker/friction -> confirmed buddy handoff -> recheck
    |
    v
Second distinct intern -> one candidate -> documentation owner review
```

### 11.2. Структура черновика

Использовать `create_access_request` с `resource_id`, `requested_role`, `reason` и
`additional_fields:{}` из [v2 API](architecture/api-contracts.md) и
[AI schema](../contracts/v2/ai.schema.json). Actor подставляет Go из сессии.
Не вводить отдельный `request_repository_access` или параллельный DTO по этому документу.

### 11.3. Обязательные гарантии

- Серверная валидация всех полей.
- Проверка идентификатора ресурса.
- Проверка разрешений пользователя.
- Явное подтверждение перед выполнением.
- Защита от повторного выполнения.
- Сохранение audit trail.
- Корректная обработка ошибки mock API.

Для Yandex AI Studio отдельно учитывать ограничение, отмеченное в исследовании: строгая JSON-схема и инструменты не всегда могут использоваться одновременно в одном запросе. Tool loop и финальную структурированную генерацию следует разделять, если этого требует API.

---

## 12. Human handoff

S4 должен создавать компактный, полезный наставнику контекст.

Рекомендуемая структура:

```json
{
  "goal_id": "goal-01",
  "blocker": "DB_SSL_REQUIRED",
  "completed_steps": [
    "Read onboarding documentation"
  ],
  "attempted_actions": [
    "Prepared access request"
  ],
  "source_ids": [
    "onboarding-001"
  ],
  "question_for_buddy": "Какие дополнительные права нужны?"
}
```

Необходимо:

- передавать только разрешённые данные;
- не отправлять всю историю диалога автоматически;
- сохранять статус эскалации;
- отображать ответ наставника;
- связывать эскалацию с соответствующим onboarding goal.

Snapshot включает текущий step, безопасные результаты checks и attempts; Go пересобирает
и проверяет его по v2 schema, intern подтверждает точный preview. Пример выше — смысловая
иллюстрация, не wire DTO. Ответ buddy не verified; требуется успешный trusted DB recheck.

### 12.1. Candidate draft после повторения

Go передаёт Python разрешённые journey/step/error, count и references/version инструкции.
Python возвращает гипотезу и возможное исправление через `/internal/v2/knowledge-gap-draft`;
создание/дедупликация candidate и review принадлежат Go. Documentation owner рассматривает
обезличенную карточку, без автоматической публикации документа или запуска ingest.

---

## 13. Экономика

### 13.1. Типовой RAG-запрос

[Каталог Cloud.ru](https://cloud.ru/products/evolution-ai-factory/catalog-foundation-models)
для GigaChat3.5-432B-A28B указывает **96,22 ₽ / 1M input** и **288,60 ₽ / 1M output**.
Для 6000 входных и 700 выходных токенов:

```text
C_request = (6000 × 96.22 + 700 × 288.60) / 1_000_000 = 0.77934 ₽
1000 / C_request ≈ 1283 запроса
800 / C_request ≈ 1026 запросов
C_embeddings = input_tokens × 0.61 / 1_000_000
```

Это теоретическая вместимость при одинаковом usage, без embeddings/retries и других
расходов; 1000 ₽ не обещают фиксированное число успешных запросов. Точный расход
определяется полным тарифицируемым usage, не числом видимых символов. Оценка «250–600
из-за reasoning» не принята: выбрана другая модель без `-Reasoning`.
AI Engineer проверяет тариф/налоги/условия своего аккаунта и сверяет первые 5–10 вызовов
с разделом активности/биллингом. Отсутствие минимального платежа отдельно не подтверждено
этой проверкой; не путать оплату токенов с требуемым пополнением счёта.
[Cloud.ru описывает регистрацию физлиц и предоплату](https://cloud.ru/docs/billing/ug/topics/concepts__cycle_fl);
доступ Foundation Models и возможность оплаты конкретной картой проверяет AI Engineer.

### 13.2. Бюджет и порядок трат

**Общий бюджет хакатона — 1000 ₽; автоматический stop по умолчанию — 800 ₽,
резерв — 200 ₽.** Все LLM/embedding API вызовы и retries учитываются вместе.
AI Engineer обеспечивает оплату и контроль самостоятельно, без подтверждения TL;
резерв не расходуется автоматически. После сверки ledger с биллингом AI Engineer может
явно перераспределить этапы/поднять stop в пределах общего лимита 1000 ₽ и записать решение.

| Этап | Плановый предел внутри первых 800 ₽ | Проверка |
|---|---:|---|
| Первые примерно 10 smoke-вызовов, включая 5–10 измерений | 20 ₽ | Доступ, TTFT, cap/usage, schema/SSE; при неизвестном billing live stop |
| 2–3 целевых live eval-прогона | 300 ₽ | Отчёт отдельно от бесплатных deterministic tests; число кейсов ограничено остатком |
| Ingest + query embeddings | 20 ₽ | Фактические tokens, profile, повтор ingest без лишних API calls |
| Репетиции и demo | До оставшихся 460 ₽ | Ledger/ACL/cache/restart проверены; запасной offline путь готов |

Это плановые верхние распределения, не измеренные затраты или гарантия достаточности.
Все prompts/fixtures сначала отлаживаются на обязательном deterministic provider;
**Ollama опциональна** для локальных экспериментов AI Engineer, без оплаты внешнего API,
но с расходом локальных ресурсов. Она не требуется CI, организаторам или offline P0,
не заменяет live eval основной модели; её результаты помечаются отдельно.

### 13.2.1. Ограничитель расходов в AI adapter

Предложение принято как задача RP-AI-02, **реализация ещё не поставлена**.
Простого счётчика после ответа недостаточно; обязательные условия:

1. До любого платного generation/embedding вызова атомарно резервировать верхнюю оценку
   его стоимости по проверенным тарифам, ограниченному input и hard output cap.
   Input считать совместимым tokenizer или доказанной верхней оценкой, не средним chars/token;
   параметры cap/n=1 и полноту billable usage проверить для endpoint.
   Проверять `spent + reserved + new_reservation <= stop`; если нет — API не вызывать,
   вернуть `LLM_UNAVAILABLE`. Retry также резервируется до отправки.
2. Для MVP допустим локальный durable ledger на persistent writable volume: блокировка
   для всех процессов/воркеров, атомарная запись, уникальный внутренний attempt ID,
   отдельно spent/reserved и версия тарифов. Отдельный Redis/сервис не нужен.
   Новая установка создаёт ledger явно; рестарт/пересоздание контейнера не обнуляет его.
3. Успех/timeout/cancel/оборванный stream могут быть оплачены. Известный usage считать
   один раз по attempt ID; резерв освобождать только после подтверждённого расчёта.
   При неизвестном usage сохранять консервативный резерв до сверки; не считать расход нулём.
   SDK retries/embeddings/ручные smoke-вызовы тем же бюджетом не должны обходить guard.
4. Повреждённый/утраченный ledger, неизвестный тариф, невозможность ограничить input/output
   или оценить весь billable usage — fail closed: `LLM_UNAVAILABLE` до сверки.
   Использовать Decimal/целые денежные единицы с округлением резерва вверх, не float-сумму.
5. Guard ограничивает управляемые им вызовы, не расходы чужих ключей/процессов аккаунта.
   Выделенный учётный scope и сверка с Cloud.ru обязательны; доступный provider-side cap
   применять после проверки его семантики, не обещать несуществующий hard billing limit.

В [OpenAPI Cloud.ru](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/f2949c1237d79b17b2df8e523e02a89a/openapi__foundation-models.yaml)
описаны `usage.prompt_tokens`, `completion_tokens`, `total_tokens`, `stream_options.include_usage`
и `max_completion_tokens`; быстрый старт использует `max_tokens`. Поддержку этих настроек
конкретным endpoint и полноту usage при SSE AI Engineer проверяет smoke, не предполагает.
Лимитер не меняет action/API contracts: budget stop — существующий `LLM_UNAVAILABLE`,
reason budget_exhausted остаётся внутренним. Платный вызов блокируется; чат получает явно обозначенный offline ответ
и рекомендацию напрямую обратиться к наставнику, без нового платного вызова. Candidate fallback Go сохраняется.

### 13.2.2. Кэш ответов для demo

Опциональная экономия RP-AI-02 после guard и safety tests; cache — не заранее записанное
доказательство live-вызова. MVP-кэш ограничен **чистыми ответами по документации**, без
истории/личных данных/goal state и без tool/action proposals. Dynamic goal/step вопросы,
заявки, IAM/checks/verified, diagnostics/handoff/candidate/review не кэшируются.

Ключ: server-derived subject + полный access_scope fingerprint + policy/ACL revision +
index/content revision + generation provider/model/settings + prompt/schema version +
точный вопрос (или доказанно безопасная нормализация). Одних role/team/question недостаточно.
На hit заново получить текущий trusted scope, проверить доступность и версии всех
sources/citations; stale/revoked/непроверяемый доступ — miss/deny без выдачи старого текста.
Изоляция между пользователями/командами обязательна; ключи/содержимое не логировать.

Записывать только законченный schema/citation/ACL-valid результат, с ограниченным TTL
и размером; partial/ошибки не сохранять. При live eval latency/quality cache выключен;
в demo/logs честно отмечать cache hit и исходный model/index revision. Hit не начисляет
повторную generation-стоимость, но реально выполненный query embedding оплачивается.

### 13.3. Обязательные метрики

Логировать для каждого LLM-вызова:

- provider;
- model;
- input tokens;
- output tokens;
- actual/estimated cost, spent/reserved/remaining, tariff revision и budget-stop;
- cache hit/miss (без prompt/cache key contents), mode и embedding profile;
- latency;
- error category;
- request ID.

Не логировать секреты и запрещённый контент.

---

## 14. Evaluation framework

### 14.1. Цель

Проверить выбор LLM на сценариях Avito AI-buddy, а не только на публичных leaderboard.

P0 baseline — **>=20 синтетических кейсов**, deterministic assertions и ручное чтение
всех ответов AI Engineer; all safety pass. 50–60 кейсов — расширение P1, не новый gate.
Live baseline GigaChat3.5-432B-A28B входит в LLM-поставку MVP (RP-AI-02) и учитывается отдельно от offline.
После MVP A-Vibe сравнивается на том же наборе, без автоматического failover.

### 14.2. Группы тестов

**Documentation QA**

- вопрос с однозначным ответом;
- вопрос по нескольким документам;
- технические сокращения;
- устаревшая версия;
- конфликтующие документы;
- отсутствие информации.

**Security**

- закрытый документ содержит ответ;
- пользователь не имеет ACL;
- prompt injection внутри документа;
- попытка получить чужой контекст.

**Actions**

- корректная заявка;
- отсутствующие поля;
- неверный идентификатор;
- недостаточные права;
- отсутствие подтверждения;
- повторное выполнение.

**Onboarding**

- невыполненный prerequisite;
- отсутствующий evidence;
- корректный next safe action;
- эскалация наставнику с preview/intersection ACL и DB recheck после ответа;
- approved без IAM grant не означает verified;
- `DB_SSL_REQUIRED` сохраняется даже при AI unavailable;
- два разных intern одной команды/группы создают один candidate;
- повторы одного intern и duplicate delivery не создают новые candidate;
- candidate draft содержит safe hypothesis, без IDs/PII/logs/chat;
- scoped documentation owner review, accepted не публикует документ.

Grouping/dedup/review проверяет Backend; AI проверяет свои inputs/outputs и safe fallback.

### 14.3. Метрики

| Метрика | Назначение |
|---|---|
| Retrieval Recall@k | Найден ли нужный разрешённый источник |
| Citation precision | Подтверждает ли ссылка утверждение |
| Groundedness | Отсутствуют ли неподтверждённые факты |
| Unknown accuracy | Корректен ли отказ при отсутствии данных |
| ACL leak rate | Нет ли утечек закрытых данных |
| JSON/schema valid rate | Проходит ли результат валидацию |
| Tool argument accuracy | Правильно ли заполнены параметры |
| Confirmation compliance | Не запускается ли действие без подтверждения |
| Russian engineering quality | Понятность и точность объяснения |
| TTFT p50/p95 | Скорость начала ответа |
| End-to-end latency p50/p95 | Полная задержка |
| Cost per successful task | Стоимость успешного сценария |

**Обязательные security gates:**

- ACL leak rate = 0 в тестовом наборе;
- неавторизованные действия = 0;
- действия без подтверждения = 0.

Сохраняется retrieval baseline >=80% expected allowed source в top-5 и all safety pass.
Latency и стоимость основной модели измеряет AI Engineer; непроверенные показатели
Reasoning не переносятся на выбранную модель. First content deadline 20s сохраняется;
smoke фиксирует реальные TTFT/timeout/usage, cache для live eval выключен.

### 14.4. Сравнение моделей

Проводить bake-off с одинаковыми:

- документами;
- ACL;
- retrieved chunks;
- prompt templates;
- JSON schemas;
- параметрами генерации;
- тестовыми запросами.

Отдельно измерять retrieval и generation, чтобы не приписывать ошибки поиска самой LLM.

---

## 15. План работ AI Engineer

Базовые ID и продуктовые зависимости — [backlog](team/backlog.md), исходный каталог владельца —
[AI handoff](team/assignments/ai-engineer.md). Последнее поручение владельца уточняет здесь
RP-AI-02: подключение GigaChat3.5-432B-A28B для MVP, расходы и вся LLM-интеграция — AI Engineer,
без предварительного подтверждения TL. Старое обозначение live только как P1 и ожидание
TL wiring не применяются к этой поставке. Зависимые документы синхронизированы с решением.
Сначала проверить поставленное:
[review 3f955322](team/ai-review-2026-11-12.md) уже фиксирует offline HTTP/SSE/ACL/diagnostics,
184 tests и 29 evals. Это не DONE полного P0; AI-R1–R4 остаются отдельным открытым review.

| Приоритет / ID | Работа AI Engineer | Приёмка / передача |
|---|---|---|
| P0 RP-CONTRACT-AI-01 | Согласованные AI schemas/fixtures с Backend/FE/TL | Реальная consumer compatibility; финальный gate сводит TL |
| P0 RP-DATA-AI-01 | Persistent kb, ACL/версии/IDs и synthetic DB/SSL corpus | Согласованные refs, повторяемый ingest и DB tests; без app/corporate writes |
| P0 RP-AI-CORE-01 | Offline provider, scoped retrieval, journey selection, DB access draft, SSE/таймеры/validation | Ранний Go access flow, команды ingest/DB tests для TL; ключ/сеть не нужны |
| P0 RP-AI-DIAG-01 | DB_SSL_REQUIRED classification, buddy summary и knowledge-gap hypothesis/fix | Safe aggregate, fallback, >=20 evals, all safety pass и ручное чтение всех ответов |
| P0 integration | AI Engineer доводит LLM-интеграцию с Go по существующему API, env/deps/config/CI и provider-specific tests | Проверенные streaming/ошибки/validation и инструкция запуска; Go ведёт approval/grant/check/friction/candidate/review, TL принимает общий A/B/C продукт |
| MVP RP-AI-02 | ai-sage/GigaChat3.5-432B-A28B; бюджет 1000/stop 800 ₽, durable reserve/usage guard, hard cap, BAAI/bge-m3 profile, опциональный safe QA cache и вся LLM-интеграция | Первые 5–10 замеров внутри примерно 10 smoke; TTFT <=20s, budget concurrency/restart/unknown-usage и ACL/cache/reindex tests, отдельные live eval/cost report; без approval TL |
| После MVP | A-Vibe через собственный OpenAI-compatible endpoint (например vLLM); hybrid/reranker и второй provider только по измерениям | Отдельные quality/security/serving/TCO tests; повторно использовать LLMProvider/RAG/Go API, не заявлять готовую интеграцию |

AI Engineer сам реализует и проверяет LLM-specific env/deps/Compose/CI/locks wiring;
подключение LLM не ждёт отдельной работы TL. Общий продуктовый release gate и прочая
инфраструктура остаются у TL. Ни Cloud.ru API, ни будущая A-Vibe не требуют переписывать RAG
или Go business state. Документально установленный ID не доказывает оплаченный доступ.
Компонентные tests/coverage >80% и AI evals не заменяют browser/security/restart/offline приёмку.

---

## 16. Разделение ответственности

### AI Engineer

Отвечает за:

- поиск/получение LLM API key, account/model access и подготовку/подключение LLM-окружения;
- LLM adapters (Cloud.ru через openai adapter), проверку endpoint/env и безопасное хранение ключа;
- обеспечение бюджета/оплаты, лимиты и контроль всех LLM-расходов без подтверждения TL;
- полную LLM-интеграцию: env/deps/config/Compose/CI/locks, transport и tests с существующим Go API;
- live smoke точного ID/тарифа, budget ledger/guard, безопасный QA cache и embedding profile/reindex;
- отчёт о результате/usage/TTFT/ETA/блокерах;
- prompt engineering;
- embeddings;
- chunking;
- retrieval;
- reranking;
- evidence packaging;
- structured generation;
- AI evaluation;
- AI observability.

### Backend Engineer

Отвечает за:

- authentication;
- authorization;
- ACL policies;
- onboarding state machine;
- action confirmation;
- mock enterprise API;
- audit persistence;
- business validation.

### Tech Lead

Отвечает за продуктовый scope, архитектурные границы, контракты, общую инфраструктуру
вне LLM-поставки и итоговую приёмку продукта. Ключ, LLM-окружение, расходы и вся
LLM-интеграция переданы AI Engineer; его работа не ждёт approval или реализации wiring TL.
Это не отменяет Go-авторизацию пользовательских действий и технические security gates.
Плановый бюджет 1000 ₽; фактическое пополнение счёта/срок/готовность live не подтверждены.

### Совместная ответственность

- API-контракты;
- error handling;
- request tracing;
- интеграционные тесты;
- end-to-end сценарии.

Не следует переносить бизнес-авторизацию в Python AI service только ради упрощения интеграции.

---

## 17. Приоритеты при ограниченном времени

Если срок хакатона не позволяет реализовать всю целевую архитектуру, использовать следующий порядок:

**Обязательный минимум:**

1. Основная live-модель — `ai-sage/GigaChat3.5-432B-A28B`, с budget guard до платных вызовов;
   полный offline/mock fallback без сети/ключа, secure retrieval и разрешённые sources.
2. Один утверждённый JSON journey доступа к тестовой БД.
3. AI draft → Go validation → exact confirm → отдельный scoped approval → IAM grant recheck.
4. Trusted DB verification, `DB_SSL_REQUIRED`, сохранённые blocker/friction и safe recovery.
5. Подтверждённый ACL-filtered buddy handoff и trusted recheck после ответа.
6. Два distinct intern → один Knowledge Gap Candidate → human review без auto-publish.
7. Negative ACL/privacy/idempotency tests, coverage >80% каждого компонента и offline E2E.

**После основного MVP:**

- собственный A-Vibe serving/vLLM и его интеграция через LLMProvider;
- расширенные retrieval-эксперименты (базовый live embedding profile — BAAI/bge-m3);
- reranker, если ещё не внедрён;
- расширенный hybrid retrieval;
- второй LLM provider;
- автоматическая маршрутизация по сложности;
- дополнительная оптимизация стоимости;
- сложные quality dashboards.

Не сокращать ACL, confirm, trusted verification, сохранение ошибок, минимальный feedback loop и offline-воспроизводимость.

---

## 18. Ограничения и риски

### Региональная доступность

Использовать только API, доступные из целевой инфраструктуры без обхода ограничений.

Не подменять внутренние модели Cloud.ru внешними proxy-моделями.

### Актуальность моделей

Названия, тарифы и доступность моделей могут измениться.

Перед реализацией проверить:

- каталог Cloud.ru;
- актуальный model ID;
- ограничения API;
- тариф;
- условия обработки данных.

### Latency

Исследование не содержит сопоставимых измерений Cloud.ru p50/p95.

Не переносить результаты Artificial Analysis или других провайдеров на Cloud.ru.

### Context window

Большое окно контекста не заменяет retrieval.

Не отправлять весь корпус документации в LLM.

### Prompt injection

Retrieved documents считаются недоверенным содержимым.

Инструкции из документов не могут переопределять системные правила или права пользователя.

### Vendor dependency

Provider abstraction обязательна. В MVP используется Cloud.ru API; собственный serving
A-Vibe — перспектива после MVP, с отдельной оценкой инфраструктуры, безопасности и TCO.
Live-подключение не считать готовым до smoke/usage/budget/latency acceptance; offline работает явно.

---

## 19. Правила актуализации рабочего плана

Рабочий план AI Engineer должен быть пересмотрен с учётом следующих решений:

1. **Primary MVP:** GigaChat3.5-432B-A28B через Cloud.ru API без reasoning; точный ID — по §4.1.
2. **MVP fallback:** явный deterministic offline retry или human handoff, без второго live provider.
3. **После MVP:** A-Vibe через собственный OpenAI-compatible endpoint; reasoning tier не требуется.
4. **RAG:** собственный, независимый от провайдера LLM.
5. **Storage:** PostgreSQL + pgvector.
6. **Embeddings:** Cloud.ru BAAI/bge-m3, один profile для index/query; несовместимая смена — reindex.
7. **Retrieval:** ACL-aware lexical baseline в offline P0; hybrid — P1 по измерениям.
8. **Reranking:** отдельный компонент, проверяемый экспериментально.
9. **Actions:** только через backend validation и confirmation.
10. **State:** детерминированная Go state machine.
11. **Quality:** синтетический evaluation suite.
12. **Fallback:** полный deterministic offline provider, безопасный отказ и human handoff.
13. **P0 scope:** test DB journey, trusted IAM/DB evidence и `DB_SSL_REQUIRED`.
14. **Feedback:** два distinct intern → один candidate → scoped documentation owner review.
15. **LLM owner:** AI Engineer обеспечивает ключ/окружение/расходы/интеграцию без approval TL; бюджет 1000 ₽, stop 800 ₽ по §13.
16. **Budget/cache:** reserve-before-call, persistent ledger, неизвестный usage не ноль; QA cache не кэширует действия или состояния.

При изменении плана необходимо:

- сохранить уже завершённые задачи;
- выявить задачи, ставшие неактуальными;
- добавить отсутствующие задачи;
- обновить зависимости;
- разделить P0 и P1;
- назначить ответственных;
- добавить acceptance criteria;
- определить порядок интеграции;
- избежать избыточной инфраструктуры.

### Формат задач

Для каждой задачи рекомендуется указывать:

- Task ID;
- название;
- приоритет;
- исполнитель;
- цель;
- зависимости;
- затрагиваемые компоненты;
- конкретные изменения;
- критерии приёмки;
- тесты;
- Definition of Done.

**Не считать исследовательскую рекомендацию доказанным результатом тестирования.** Если выбор модели ещё не проверен на сценариях проекта, это должно быть явно отмечено в плане.

---

## 20. Definition of Done

AI-подсистема готова к демонстрации MVP, когда:

- S1 отвечает на вопросы по разрешённым документам с проверяемыми цитатами.
- S2 объясняет прогресс, prerequisites и blockers.
- S3 проходит DB draft/confirm/отдельный approval/IAM recheck и trusted DB verification, включая DB_SSL_REQUIRED.
- S4 формирует подтверждённую безопасную эскалацию наставнику; ответ не подменяет recheck.
- Go сохраняет friction; два distinct intern создают один candidate, повторы одного не достигают порога.
- AI готовит безопасную гипотезу; при его отказе доступна deterministic card Go.
- Scoped documentation_owner рассматривает candidate; accepted не публикует документацию.
- Полный A/B/C путь работает offline без provider key/сети; mock/live явно различаются.
- ACL применяется до передачи данных модели.
- Structured outputs проходят валидацию.
- LLM не может самостоятельно выполнить привилегированное действие.
- Отсутствие информации обрабатывается корректно.
- Есть тесты security-critical сценариев.
- Есть метрики latency, usage и ошибок.
- AI service запускается локально по документации.
- Все демонстрационные данные синтетические.
- Для live demo проверены доступ ai-sage/GigaChat3.5-432B-A28B, usage/тариф, TTFT/таймауты и schema/tools.
- Budget tests: порог до вызова, параллельные reservations, restart, duplicate settlement, corrupt/missing ledger, timeout/cancel/unknown usage, embedding/retry costs; без обхода лимита.
- Cache tests: subject/scope/revision isolation, revoke/обновление источника, model/prompt смена, исключение dynamic/action responses, cache-off live eval.
- Index/query profile совпадает; смена embedding provider/profile требует reindex, смена generation LLM — нет.
- AI Engineer самостоятельно завершил LLM wiring и передал воспроизводимые tests/usage/cost, без ожидания подтверждения TL на расходы.
- Архитектура допускает будущую A-Vibe через provider adapter; её реализация не является gate MVP.

---

## 21. Итоговое решение

Для Avito AI-buddy рекомендуется следующая конфигурация:

**Primary MVP:** GigaChat3.5-432B-A28B через Cloud.ru API и openai adapter, без reasoning.
Точный API ID: `ai-sage/GigaChat3.5-432B-A28B`; это отдельная запись без `-Reasoning`.

**Fallback MVP:** deterministic offline provider с явным retry, безопасный отказ и buddy.

**После MVP:** A-Vibe от AvitoTech через собственный OpenAI-compatible endpoint, например
vLLM, с повторным использованием LLMProvider и RAG. Потенциальный путь во внутреннюю
инфраструктуру Авито; интеграция и готовый endpoint пока не реализованы.

**RAG:** PostgreSQL/kb + pgvector; offline lexical baseline без сети/ключа, live BAAI/bge-m3 через Cloud.ru. Один embedding profile index/query, смена profile — reindex. Hybrid/reranking — после MVP по измерениям.

**Business logic:** детерминированный Go backend.

**AI orchestration:** Python.

**Security:** серверная авторизация, schema validation, explicit confirmation, audit.

**Evaluation:** P0 >=20 кейсов, all safety pass и ручное чтение; 50–60 — расширение P1. Метрики live quality/latency/cost учитываются отдельно от offline.

Главный приоритет — построить надёжную систему, которая помогает стажёру пройти путь от текущей задачи до следующего безопасного действия, а при необходимости передаёт проблему наставнику.

**LLM является интеллектуальным компонентом продукта, но не заменяет его бизнес-логику и систему безопасности.**

**P0:** test DB → trusted checks → DB_SSL_REQUIRED → buddy/recheck → повтор у двух
стажёров → один candidate → review documentation_owner. Offline приёмка независима от
live API; для заявления о работающей основной модели требуется её отдельная live-приёмка.

**Полная LLM-поставка:** AI Engineer сам получает ключ/доступ, готовит окружение,
обеспечивает бюджет/оплату, контролирует расходы и выполняет всю LLM-интеграцию,
включая нужный config/dependency/Compose/CI wiring. Подтверждения TL для начала работы,
расходов и подключения не ждёт. Передаёт фактические результаты, лимиты, ETA/блокеры;
эта документация не утверждает наличие оплаченного доступа или готовой интеграции.

**Экономия:** 1000 ₽ общий бюджет / 800 ₽ начальный stop, persistent reserve/usage ledger,
жёсткий output cap и отдельный учёт embeddings/retries. Ollama опциональна; demo cache
ограничен ACL-проверенными статическими QA, cache-off live eval. Всё это — требования к
поставке AI Engineer, а не уже работающие функции.
