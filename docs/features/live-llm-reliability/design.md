# Реальные ответы LLM и управляемый fallback — design v3

Target proposal, не executable schema/runtime. [Spec](spec.md).

Известные факты source b6f940d: scripts/demo.py задаёт LLM_MODE=mock/LLM_API_KEY="";
compose.demo.yaml принудительно включает mock. Это ожидаемая offline конфигурация, а не
доказанный отказ провайдера. Live profile и текущие пользовательские key/доступ/баланс в
этом docs-проходе не проверялись. QUERY_EMBEDDINGS=off задаёт лексический query retrieval,
сам по себе не означает offline генерацию. Profile/index/embedding readiness проверяются отдельно.

AI начинает с воспроизводимого отчёта: effective mode/provider/base host/model IDs без key,
затем доступность моделей/auth/tariffs/budget reserve, HTTP code class, первый content,
idle/overall limit, empty/invalid ответ, source/schema rejection, cooldown. Различать
config_mock, config_invalid, auth_denied, model_unavailable, rate_limited, timeout,
budget_denied, schema_invalid, source_rejected, interrupted; final enum утверждает gate.
Сверить compose inheritance и реально запущенный image/env, а не только .env.example.
Не печатать ключ/authorization/cookies/chat/provider payload или prompt в лог.

План: AI проверяет adapter/config/latency, TL готовит однозначные offline/live launch
commands и readiness, BE сохраняет correlation/run outcome, FE получает server-owned
origin/status. Существующие фразы остаются отображением для v2; v3 предлагает additive
ResponseOrigin DTO: mode, origin=primary|secondary|offline, completion=complete|interrupted,
safe reason_code, opaque correlation ID. В SSE/history/REST одна истина; source/tool validation
до публикации, partial после обрыва не превращается в успешный completed/proposal.
Не определять происхождение v3 ответа только regex по тексту модели. Ключи/host diagnostics
показываются только оператору, не стажёру. DTO требует BE↔AI↔FE review, публичные схемы не правятся сейчас.

Сохранить первые 20s, idle 25s, AI 85s/Go 90s и действующее окно до первого фрагмента
попытки <=6s: сначала измерить, не расширять вслепую. После первого фрагмента не смешивать
две модели; interrupted маркируется честно и предлагает явный retry. 30s cooldown и query
embedding fallback не блокируют возврат к primary после восстановления. Ledger persistent,
общий для attempts/embeddings, unknown usage остаётся резервом, hard cap сохранён.

Телеметрия AI-owned без текстов/PII: attempts/outcomes/latency/usage/cost, live runs по
origin/reason и знаменатель eligible live runs. Planned mock runs и safety/budget отказы
учитывать отдельно. В P0 это operator report, не новая панель технических ошибок наставнику.
Actual provider/billing сверять без двойного учёта и с пометкой estimated/settled/unknown.
Paid smoke выполняет AI в рамках существующего 1000/stop 800 ₽ бюджета, не CI; 10 запросов
не являются обязательством потратить весь лимит, при отказе бюджета gate остаётся открытым.

[Общие границы](../../v3/architecture.md), [задачи/owners](../../v3/delivery.md).
