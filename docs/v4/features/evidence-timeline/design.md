# Доказательства состояния — design v4

Target proposal; [spec](spec.md), [общая архитектура](../../architecture.md).

Go строит read model по own goal/check/evidence/request correlations. Entry содержит
opaque id, kind, observed_at/received_at (если доступны), safe label, source kind,
trusted flag, relevant step/version, current validity, optional permitted detail link.
Не отдавать raw event payload, actor IDs/PII, DSN, corporate URLs и полные ответы AI.

Порядок observed_at с deterministic tie-breaker; received_at отделён для out-of-order.
Dedup по trusted event/check ID. Разрыв истории → «сведения недоступны», не создание факта.
Old event не отменяет newer current reducer state. Timeline read никогда не запускает check
или state transition. Pagination фиксирует as_of, каждая страница re-authorized.

Связи parent/child показывают только утверждённые journey dependencies и correlation,
не вероятностный causal graph. Unavailable check не failure качества ТЗ. UI показывает
safe explanation и доступную check/recovery кнопку, исполняемую прежним Go endpoint.
Состояние пересчитывается существующим reducer; timeline не второй владелец state.

Schemas/migrations и публичные поля принимаются в V4-CONTRACT-01, не этим Markdown.
