"""Проверка данных по общим JSON Schema из contracts/v2.

Схема — единственный источник правды для wire-формата: собственных моделей
запросов (Pydantic и т.п.) сервис не заводит. Ссылки $ref разрешаются только
по локальным файлам, сеть не нужна.
"""

import json
import re
from functools import cache
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

# ai-service/app/contracts.py -> корень репозитория (в Docker: /workspace).
CONTRACTS_DIR = Path(__file__).resolve().parents[2] / "contracts" / "v2"
AI_SCHEMA_ID = "https://ai-buddy.invalid/contracts/v2/ai.schema.json"
COMMON_SCHEMA_ID = "https://ai-buddy.invalid/contracts/v2/common.schema.json"
AI_V3_SCHEMA_ID = "https://ai-buddy.invalid/contracts/v3/ai.schema.json"
# Имя поля в Error.fields обязано быть StableId.
STABLE_ID = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
MAX_ERROR_FIELDS = 20


@cache
def registry() -> Registry:
    resources = []
    paths = sorted(CONTRACTS_DIR.glob("*.schema.json"))
    # v3 добавляет свои определения (происхождение ответа, черновик отчёта о ТЗ) рядом с v2.
    paths += sorted((CONTRACTS_DIR.parent / "v3").glob("*.schema.json"))
    for path in paths:
        contents = json.loads(path.read_text(encoding="utf-8"))
        resources.append((contents["$id"], Resource.from_contents(contents)))
    return Registry().with_resources(resources)


@cache
def validator(definition: str, schema_id: str = AI_SCHEMA_ID) -> Draft202012Validator:
    schema = {"$ref": f"{schema_id}#/$defs/{definition}"}
    return Draft202012Validator(schema, registry=registry(), format_checker=FormatChecker())


def error_fields(
    definition: str, data: object, schema_id: str = AI_SCHEMA_ID
) -> list[dict[str, str]]:
    """Возвращает безопасный список ошибок {name, code}; пустой список — данные валидны.

    name — поле верхнего уровня (или "body"), code — нарушенное правило схемы.
    Значения из запроса в ответ не попадают.
    """
    fields = []
    for error in validator(definition, schema_id).iter_errors(data):
        names = ["body"]
        if error.path:
            if STABLE_ID.match(str(error.path[0])):
                names = [str(error.path[0])]
        elif error.validator == "required" and isinstance(error.instance, dict):
            # Нет обязательного поля верхнего уровня: имя берём из схемы, не из запроса.
            names = [name for name in error.validator_value if name not in error.instance]
        for name in names:
            item = {"name": name, "code": str(error.validator)}
            if item not in fields:
                fields.append(item)
    return fields[:MAX_ERROR_FIELDS]


def is_valid(definition: str, data: object, schema_id: str = AI_SCHEMA_ID) -> bool:
    return validator(definition, schema_id).is_valid(data)
