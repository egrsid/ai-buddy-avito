# Контракты API

JSON Schema определяют закрытые DTO, входы/выходы и ошибки; examples/invalid содержат
позитивные и отрицательные payloads. Схемы проверяются shared tests и runtime adapters.

| Каталог | Область |
|---|---|
| [v2](v2) | Авторизация, goals/steps, actions, knowledge, runs/SSE, IAM/DB, evidence и feedback |
| [v3](v3) | TaskBrief/assignments, Telegram preview/export, clarity reports, origin и statistics |
| [v4](v4) | Workspace links, timeline, revision proposals, impact и trusted events |

`v1.schema.json` и legacy examples сохраняются для совместимости seed/проверок.
Версия схемы не является отдельной версией продукта: текущий UI использует v2/v3/v4 API.
React обращается только к Go. Внутренний AI API получает trusted scope от Go;
публичный клиент не задаёт права, actor или verified.

Action preview и confirm, человеческое approval и trusted verification — разные операции.
Preview имеет TTL/operation key; stale/replay повторно проверяют scope и версии.
AI structured draft не исполняется без Go validation и требуемого подтверждения.

```sh
make check
uv run --frozen pytest tests/test_contracts_v2_backend.py tests/test_contracts_v2_ai.py -q
```

[SDD](../docs/sdd/README.md) связывают поведение и отрицательные случаи с тестами.
Формальное независимое утверждение контрактов организацией не подменяется этой валидацией.
