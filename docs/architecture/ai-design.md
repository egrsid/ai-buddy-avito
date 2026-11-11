# AI design target v2

Версия 2.0 · проектирование. Сейчас AI предоставляет только /healthz, не генерацию/RAG.
[Contextual AI SDD](../features/contextual-ai-assistance/spec.md),
[API](api-contracts.md), [security](security.md) задают границы; AI Engineer выбирает
adapters/prompting/retrieval/структуру модулей и eval методику внутри этих контрактов. [Назначение AI](../team/assignments/ai-engineer.md)
разделяет RP-AI-01 на ранний RP-AI-CORE-01 (generate/retrieval/route/access draft) и
RP-AI-DIAG-01 (classification/buddy/candidate); Go chat не ждёт завершения DIAG.

## Режимы и ответственность

LLM_MODE=mock — deterministic offline provider, без сети/ключа; покрывает выбор journey,
объяснение, draft заявки, safe классификацию, handoff и candidate draft. Это обязательный
fallback для полного P0 demo, а не только fixtures для чат-ответа. UI/отчёт помечают
режим mock/live. Он не является доказательством качества live LLM или pgvector RAG.
LLM_MODE=live подключается после RP-AI-02: provider/model/key/budget/embeddings доступны
и проверены. Платный ключ не нужен CI и не блокирует offline P0. При live-сбое не
дописывать смесь live/mock токенов в начатый stream: завершить failed, дать явный retry
в обозначенном offline режиме. Контекст action/права/confirm при смене provider не обходятся.

Сохраняются LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, EMBEDDING_MODEL/DIM. Ключ только Python,
.env.example без секретов; environment wiring ещё предстоит реализовать.
Python ничего не меняет в app/corporate. Ни classification, ни confidence, ни generated
summary не являются evidence. Обязательные маршруты/permissions/checks принадлежат Go.

## Pipeline

1. Проверить token/schema/access_scope и allowed journeys/tools; отсутствие scope — отказ.
2. Получить только разрешённый goal/step, dependencies/evidence/blocker/safe actions из Go.
3. Retrieval с document/chunk ACL до top-5/LLM; повторная проверка title/metadata/refs/version.
   Даже offline fixture обязан применять scope. Не получать все документы с последующим
   редактированием готового ответа: запрещённый фрагмент вообще не передаётся модели.
4. Prompt: synthetic environment; инструкции из документов — данные; не придумывать
   обязательные этапы/аббревиатуры, не выдавать submitted/approved/ответ buddy за verified.
5. Объяснить текущую причину/следующий допустимый шаг. Practice First: предложить
   предусмотренную проверку. RAG помогает конкретной цели, словарь не центральный сценарий.
6. Один ограниченный run, <=1 tool proposal, никакого автономного выполнения/цепочки.
   Структурированные операции валидируются по закрытым schema; Go повторяет бизнес-валидацию.
7. При неизвестном/неоднозначном ответе честно уточнить или предложить buddy preview.
   Невалидный JSON/лишние поля/недопустимая роль/refs → AI_SCHEMA_INVALID без исполнения.

Выбор journey возвращает ID/version только из allowed list. Draft содержит ресурс,
requested_role, reason, additional_fields (пусто в P0); actor подставляет Go. Недостающие
поля → clarification/missing_fields. Handoff использует пересечение ACL intern/buddy,
checks/actions/errors и hypothesis с confidence, не психологические оценки. Candidate
получает только safe aggregate, отличает наблюдаемый паттерн от гипотезы дефекта инструкции.
При AI-сбое Go сохраняет минимальную детерминированную карточку, enrichment можно повторить.

## Индексация

Текущие data/knowledge/*.md и evals.json — legacy учебный набор, все demo_public и
репозиторный сценарий; это не готовый dataset нового MVP. AI RP-DATA-AI-01 добавляет
согласованные team/restricted/privacy fixtures и инструкции БД; Backend RP-MOCK-01 —
users/resources/assignments. UUID/refs согласуются до seed. Не редактировать runtime
материалы как часть документационной задачи. Новая версия source/chunks/ACL публикуется
только human review; candidate accepted не запускает ingest самостоятельно.

Markdown → plain text; baseline chunks 600–1000 символов, overlap 100, заголовок и
source version/hash/model/dimension/ACL в метаданных. Атомарный ingest/reindex; scope-aware
cache; старый index не открывает отозванный документ. Для offline baseline допустим
лексический поиск, явно не vector RAG. Live RAG — реальные embeddings/pgvector; размерность
фиксируется новой миграцией, несовместимые модели не смешиваются. Exact cosine baseline,
ANN только после измерения и отдельного решения. kb — физическая logical knowledge.

## Ошибки и оценка

Connect/first token/idle/run limits и cancel по state-machines.md; provider ошибки
нормализуются LLM_UNAVAILABLE/LLM_TIMEOUT без raw payload. После начала stream нет
автоматического повторного LLM write/tool. Go сохраняет partial/failed, не pending action.

RP-AI-01 расширяет evals >=20: goal selection, draft correctness/missing fields, IAM
absent/approved-without-grant, DB_SSL_REQUIRED, practice/recheck, privacy разных команд,
restricted title/metadata/citations, personal-data fixture, injection, non-evidence AI,
handoff filtering, candidate hypothesis и offline fallback. Проверять свойства, refs,
schema и отсутствие запрещённого контента, не дословное совпадение текста.
Все safety cases обязательны; baseline retrieval target >=80% кейсов с нужным документом
в top-5 среди разрешённых. Live отчёт фиксирует provider/model/settings/dataset version,
качество, latency/cost и не смешивается с mock результатами. Текущие 10 legacy evals
не являются такой приёмкой. Автоматические component tests/coverage >80% отдельны от evals.
