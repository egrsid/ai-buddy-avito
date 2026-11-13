"""Проверки внутреннего запроса Go -> Python до начала SSE-потока.

Порядок фиксирован политикой (ai-integration-policy.md, раздел 1):
токен 401 -> X-Request-ID 400 -> JSON 400 -> схема 422 -> выключенный mock fault 403.
"""

import base64
import binascii
import hmac
import json
import re
import uuid

from fastapi import Request

from app.config import Settings
from app.contracts import AI_SCHEMA_ID, COMMON_SCHEMA_ID, error_fields
from app.errors import ApiError

# Как common Uuid: каноническая строка UUIDv4 в нижнем регистре.
UUID_V4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
BASE64URL = re.compile(r"^[A-Za-z0-9_-]+={0,2}$")
MOCK_SCENARIOS = ("normal", "unavailable", "timeout", "slow_stream", "invalid_tool")
MAX_MESSAGES_CHARS = 12000
MAX_BODY_BYTES = 64 * 1024
MAX_SCOPE_HEADER = 8 * 1024


def valid_request_id(request: Request) -> str | None:
    """Возвращает X-Request-ID в нижнем регистре или None, если он отсутствует/неверен/повторён."""
    values = request.headers.getlist("x-request-id")
    if len(values) != 1:
        return None
    value = values[0].strip().lower()
    if not UUID_V4.match(value):
        return None
    return value


def token_is_valid(request: Request, settings: Settings) -> bool:
    values = request.headers.getlist("authorization")
    if len(values) != 1 or not values[0].startswith("Bearer "):
        return False
    given = values[0][len("Bearer ") :].encode("utf-8")
    expected = settings.internal_api_token.encode("utf-8")
    # Сравнение за постоянное время: по скорости ответа токен не подобрать.
    return hmac.compare_digest(given, expected)


def reject_constant(name: str) -> None:
    raise ValueError(f"недопустимое значение {name}")


def parse_json(raw: bytes) -> object:
    # NaN/Infinity не входят в стандарт JSON, Go их не отправляет.
    return json.loads(raw.decode("utf-8"), parse_constant=reject_constant)


def messages_too_long(body: dict) -> bool:
    total = 0
    for message in body.get("messages", []):
        total += len(message["content"])
    return total > MAX_MESSAGES_CHARS


def check_auth(request: Request, settings: Settings) -> str:
    """Токен, затем X-Request-ID. Возвращает проверенный request_id или бросает ApiError."""
    request_id = valid_request_id(request)

    if not token_is_valid(request, settings):
        raise ApiError(
            401, "UNAUTHENTICATED", "Неверный сервисный токен", request_id or str(uuid.uuid4())
        )
    if request_id is None:
        raise ApiError(
            400, "INVALID_REQUEST_ID", "Нужен один X-Request-ID в формате UUID", str(uuid.uuid4())
        )
    return request_id


async def read_internal_request(
    request: Request, settings: Settings, definition: str, schema_id: str = AI_SCHEMA_ID
) -> tuple[str, dict]:
    """Проверяет токен, ID, JSON и схему. Возвращает (request_id, тело) или бросает ApiError."""
    request_id = check_auth(request, settings)

    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        fields = [{"name": "body", "code": "maxBytes"}]
        raise ApiError(422, "VALIDATION_ERROR", "Тело запроса больше 64 KiB", request_id, fields)
    try:
        body = parse_json(raw)
    except ValueError:
        # UnicodeDecodeError и json.JSONDecodeError — тоже ValueError.
        raise ApiError(400, "INVALID_JSON", "Тело запроса не является JSON", request_id)

    fields = error_fields(definition, body, schema_id)
    if not fields and definition == "GenerateRequest" and messages_too_long(body):
        fields = [{"name": "messages", "code": "maxTotalLength"}]
    if fields:
        raise ApiError(422, "VALIDATION_ERROR", "Запрос не соответствует схеме", request_id, fields)

    return request_id, body


def mock_scenario(request: Request, settings: Settings, request_id: str) -> str:
    """Читает X-Mock-Scenario. Без заголовка — normal.

    Если механизм сбоев выключен, любой заголовок -> 403: в production его просто нет.
    """
    values = request.headers.getlist("x-mock-scenario")
    if not values:
        return "normal"
    faults_allowed = (
        settings.mock_faults_enabled
        and settings.app_env in ("local", "test")
        and settings.llm_mode == "mock"
    )
    if not faults_allowed:
        raise ApiError(403, "FORBIDDEN", "Mock-сбои выключены", request_id)
    if len(values) != 1 or values[0] not in MOCK_SCENARIOS:
        fields = [{"name": "x-mock-scenario", "code": "enum"}]
        raise ApiError(422, "VALIDATION_ERROR", "Неизвестный mock-сценарий", request_id, fields)
    return values[0]


def read_scope_header(request: Request, request_id: str) -> dict:
    """X-Access-Scope для GET: base64url(UTF-8 JSON AccessScope), не больше 8 KiB."""
    values = request.headers.getlist("x-access-scope")
    fields = [{"name": "x-access-scope", "code": "required"}]
    if len(values) != 1:
        raise ApiError(422, "VALIDATION_ERROR", "Нужен один X-Access-Scope", request_id, fields)
    value = values[0]
    if len(value) > MAX_SCOPE_HEADER:
        fields = [{"name": "x-access-scope", "code": "maxLength"}]
        raise ApiError(422, "VALIDATION_ERROR", "X-Access-Scope больше 8 KiB", request_id, fields)
    if not BASE64URL.match(value):
        raise ApiError(400, "INVALID_JSON", "X-Access-Scope не base64url JSON", request_id)
    try:
        # base64url без обязательного выравнивания "=".
        raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        scope = parse_json(raw)
    except (ValueError, binascii.Error):
        raise ApiError(400, "INVALID_JSON", "X-Access-Scope не base64url JSON", request_id)
    fields = error_fields("AccessScope", scope, COMMON_SCHEMA_ID)
    if fields:
        fields = [{"name": "x-access-scope", "code": field["code"]} for field in fields]
        raise ApiError(422, "VALIDATION_ERROR", "Неверный X-Access-Scope", request_id, fields)
    return scope


def raise_for_scenario(scenario: str, request_id: str) -> None:
    """Для непотоковых операций mock-сбой превращается в JSON-ошибку модели."""
    if scenario == "unavailable":
        raise ApiError(503, "LLM_UNAVAILABLE", "Модель временно недоступна", request_id)
    if scenario == "timeout":
        raise ApiError(504, "LLM_TIMEOUT", "Модель не ответила вовремя", request_id)
