# Проверяемое AI-демо — design v4

Target proposal; [spec](spec.md), [общая архитектура](../../architecture.md).

Manifest: commit/tree revision, schema hash, dataset revision, launch profile, clock source,
case IDs, origin/reason/completion, safe correlation, latency, token usage и cost status
settled/estimated/unknown. В отчёте нет ключа, cookie, prompt, raw chat или чужих заголовков.
Если ответ редактируется для презентации, это отдельный материал, не evidence живого run.

CI fake-provider suites проверяют branches timeout/429/auth/budget/schema/cancel/cooldown.
Paid smoke отдельно: 10 synthetic последовательных primary runs через Go, validated sources,
real usage/latency и тот же persistent ledger; не делать reset ledger или рост deadlines.
Сохранить primary GigaChat/GigaChat-3-Pro → secondary ai-sage/GigaChat3.5-432B-A28B → offline,
до проверки actual provider IDs/цен; unknown usage держит reserve, budget denial не запускает
вторую платную попытку. 20/25/85/90s и текущий 6s attempt first-content guard сохраняются.

Fault demo выполняется безопасным operator-only local/test механизмом. Не принимать fault
headers произвольного browser пользователя; fake fault не выдавать за actual provider outage.
Один свежий isolated dataset создаётся harness, seed replay сохраняет результаты; старые
volumes никогда не удаляются неявно. Живые сравнения cohorts не заменяются UI fixtures.
Для семидневной comparison demo разрешён явно synthetic test clock на отдельном dataset,
не перенос timestamps в пользовательской базе. План видео/операций — в demo.md.

Schemas/migrations и публичные поля принимаются в V4-CONTRACT-01, не этим Markdown.
