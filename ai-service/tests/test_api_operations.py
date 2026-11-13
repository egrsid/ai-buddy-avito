"""HTTP-уровень knowledge и структурированных операций."""

import asyncio
import base64
import json

import pytest
from ai_test_support import (
    DOC_A,
    DOC_B,
    REQUEST_ID,
    SECRET_MARKERS,
    TOKEN,
    generate_request,
    greedy_scope,
    intern_a_scope,
    intern_c_scope,
    knowledge,
    make_settings,
    parse_sse,
)
from app.api import create_app
from app.contracts import is_valid
from fastapi.testclient import TestClient

PREFIX = "/internal/v2"


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app(make_settings()))


@pytest.fixture(scope="module")
def faulty_client() -> TestClient:
    return TestClient(create_app(make_settings(mock_faults_enabled=True)))


def headers(**extra) -> dict:
    values = {"Authorization": f"Bearer {TOKEN}", "X-Request-ID": REQUEST_ID}
    values.update(extra)
    return values


def encode_scope(scope) -> str:
    raw = json.dumps(scope, ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def post(test_client, path, body, **extra):
    return test_client.post(f"{PREFIX}{path}", json=body, headers=headers(**extra))


def assert_error(response, status, code):
    assert response.status_code == status, response.text
    body = response.json()
    assert is_valid("InternalError", body), body
    assert body["error"]["code"] == code
    return body["error"]


def test_search_returns_only_permitted_sources(client):
    body = {"access_scope": intern_a_scope(), "query": "подключение к тестовой базе", "top_k": 5}
    response = post(client, "/knowledge/search", body)
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == REQUEST_ID
    result = response.json()
    assert is_valid("KnowledgeSearchResponse", result)
    assert DOC_A in [source["document_id"] for source in result["sources"]]

    body["access_scope"] = intern_c_scope()
    result = post(client, "/knowledge/search", body).json()
    assert DOC_A not in [source["document_id"] for source in result["sources"]]


def test_search_without_scope_is_rejected(client):
    error = assert_error(
        post(client, "/knowledge/search", {"query": "база"}), 422, "VALIDATION_ERROR"
    )
    assert {"name": "access_scope", "code": "required"} in error["fields"]


def test_search_greedy_scope_leaks_nothing(client):
    body = {"access_scope": greedy_scope(), "query": "кодовое слово телефон ORCHID CRIMSON PEARL"}
    text = post(client, "/knowledge/search", body).text
    for marker in SECRET_MARKERS:
        assert marker not in text


def get_document(test_client, document_id, scope_value=None, **extra):
    request_headers = headers(**extra)
    if scope_value is not None:
        request_headers["X-Access-Scope"] = scope_value
    return test_client.get(f"{PREFIX}/knowledge/{document_id}", headers=request_headers)


def test_get_permitted_document(client):
    response = get_document(client, DOC_A, encode_scope(intern_a_scope()))
    assert response.status_code == 200
    document = response.json()
    assert is_valid("KnowledgeDocumentResponse", document)
    assert document["synthetic"] is True


@pytest.mark.parametrize("document_id", [DOC_B, "00000099-0000-4000-8000-000000000099", "x"])
def test_get_forbidden_or_missing_is_same_404(client, document_id):
    response = get_document(client, document_id, encode_scope(intern_a_scope()))
    error = assert_error(response, 404, "NOT_FOUND")
    assert "ORCHID" not in response.text
    assert error["message"] == "Документ не найден"


def test_get_requires_token_first(client):
    response = client.get(f"{PREFIX}/knowledge/{DOC_A}", headers={"X-Request-ID": REQUEST_ID})
    assert_error(response, 401, "UNAUTHENTICATED")


@pytest.mark.parametrize(
    "scope_value, status, code",
    [
        (None, 422, "VALIDATION_ERROR"),
        ("%%%not-base64%%%", 400, "INVALID_JSON"),
        (base64.urlsafe_b64encode(b"not json").decode(), 400, "INVALID_JSON"),
        (encode_scope({"subject_id": "x"}), 422, "VALIDATION_ERROR"),
        ("A" * (8 * 1024 + 1), 422, "VALIDATION_ERROR"),
    ],
)
def test_get_bad_scope_header(client, scope_value, status, code):
    error = assert_error(get_document(client, DOC_A, scope_value), status, code)
    for field in error.get("fields", []):
        assert field["name"] == "x-access-scope"


JOURNEY = {
    "journey_id": "db-access-team-a",
    "version": 1,
    "title": "Доступ к тестовой БД команды A",
}

OPERATIONS = [
    (
        "/journey-selection",
        {"access_scope": None, "intent": "нужен доступ к базе", "allowed_journeys": [JOURNEY]},
        "JourneySelectionResponse",
    ),
    (
        "/access-request-draft",
        {
            "access_scope": None,
            "goal_id": "0000001e-0000-4000-8000-00000000001e",
            "step_id": "check_access",
            "permitted_resource": "db-team-a-test",
            "allowed_roles": ["db_reader"],
            "context": "Первая учебная задача.",
        },
        "AccessRequestDraftResponse",
    ),
    (
        "/classify-error",
        {
            "access_scope": None,
            "step_id": "check_connection",
            "error_code": "DB_SSL_REQUIRED",
            "allowed_blocker_types": ["db_ssl_required"],
        },
        "ClassifyErrorResponse",
    ),
    (
        "/diagnostic-summary",
        {
            "access_scope": None,
            "goal": {"id": "0000001e-0000-4000-8000-00000000001e", "title": "Доступ к БД"},
            "step": {"id": "check_connection", "title": "Проверить подключение"},
            "blocker": {
                "id": "00000028-0000-4000-8000-000000000028",
                "type": "db_ssl_required",
                "error_code": "DB_SSL_REQUIRED",
            },
            "checks": [],
            "attempted_actions": [],
            "instruction_refs": [{"document_id": DOC_A, "version": 1}],
        },
        "DiagnosticSummaryResponse",
    ),
    (
        "/knowledge-gap-draft",
        {
            "access_scope": None,
            "journey_id": "db-access-team-a",
            "step_id": "check_connection",
            "error_code": "DB_SSL_REQUIRED",
            "affected_count": 2,
            "instruction_refs": [{"document_id": DOC_A, "version": 1}],
        },
        "KnowledgeGapDraftResponse",
    ),
]


def with_scope(body: dict) -> dict:
    return {**body, "access_scope": intern_a_scope()}


@pytest.mark.parametrize("path, body, response_definition", OPERATIONS)
def test_operation_returns_contract_response(client, path, body, response_definition):
    response = post(client, path, with_scope(body))
    assert response.status_code == 200, response.text
    assert response.headers["X-Request-ID"] == REQUEST_ID
    assert is_valid(response_definition, response.json()), response.json()


@pytest.mark.parametrize("path, body, response_definition", OPERATIONS)
def test_operation_rejects_unknown_fields(client, path, body, response_definition):
    response = post(client, path, {**with_scope(body), "actor": "intern"})
    assert_error(response, 422, "VALIDATION_ERROR")


@pytest.mark.parametrize("path, body, response_definition", OPERATIONS)
def test_operation_without_scope_is_rejected(client, path, body, response_definition):
    request = dict(body)
    del request["access_scope"]
    assert_error(post(client, path, request), 422, "VALIDATION_ERROR")


@pytest.mark.parametrize(
    "scenario, status, code",
    [("unavailable", 503, "LLM_UNAVAILABLE"), ("timeout", 504, "LLM_TIMEOUT")],
)
def test_operation_mock_faults(faulty_client, scenario, status, code):
    path, body, _ = OPERATIONS[2]
    response = post(faulty_client, path, with_scope(body), **{"X-Mock-Scenario": scenario})
    assert_error(response, status, code)


def test_operation_mock_header_forbidden_by_default(client):
    path, body, _ = OPERATIONS[2]
    response = post(client, path, with_scope(body), **{"X-Mock-Scenario": "normal"})
    assert_error(response, 403, "FORBIDDEN")


def test_knowledge_gap_without_permitted_refs_is_404(client):
    path, body, _ = OPERATIONS[4]
    request = with_scope(body)
    request["instruction_refs"] = [{"document_id": DOC_B, "version": 1}]
    assert_error(post(client, path, request), 404, "NOT_FOUND")


def test_body_over_64_kib_is_rejected(client):
    path, body, _ = OPERATIONS[0]
    request = with_scope(body)
    request["intent"] = "я" * 40000  # ~80 KiB в UTF-8
    error = assert_error(post(client, path, request), 422, "VALIDATION_ERROR")
    assert error["fields"] == [{"name": "body", "code": "maxBytes"}]


def test_generate_stream_has_permitted_sources_and_access_tool(client):
    request = generate_request()
    request["access_scope"] = intern_a_scope()
    request["allowed_tools"] = ["create_access_request"]
    request["goal_context"]["current_step_id"] = "check_access"
    request["goal_context"]["next_actions"] = ["create_access_request"]
    request["action_results"] = []
    response = post(client, "/generate", request)
    items = parse_sse(response.text)
    names = [item["event"] for item in items if "event" in item]
    assert names[-3:] == ["message.sources", "tool.proposed", "generation.completed"]
    sources = items[-3]["data"]["sources"]
    assert sources
    assert {source["document_id"] for source in sources} <= {
        DOC_A,
        "0000000b-0000-4000-8000-00000000000b",
        "0000000c-0000-4000-8000-00000000000c",
        "00000010-0000-4000-8000-000000000010",
    }
    assert is_valid("MessageSourcesEvent", items[-3]["data"])
    assert is_valid("ToolProposedEvent", items[-2]["data"])


# --- ответы по схеме и бюджет 85 с (ревью TL, AI-R2/AI-R3) ---------------------------


def max_journeys(count: int) -> list[dict]:
    """Максимальные названия маршрутов: 200 кириллических символов."""
    return [
        {"journey_id": f"journey-{index}", "version": 1, "title": "Ж" * 200}
        for index in range(count)
    ]


@pytest.mark.parametrize("count", [5, 10])
def test_clarification_fits_limit_on_max_titles(client, count):
    """Воспроизведение TL: intent «???», длинные названия -> раньше 1051 символ при лимите 1000."""
    body = {
        "access_scope": intern_a_scope(),
        "intent": "???",
        "allowed_journeys": max_journeys(count),
    }
    response = post(client, "/journey-selection", body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert is_valid("JourneySelectionResponse", result), result
    assert len(result["clarification"]) <= 1000


MAX_INPUTS = [
    (OPERATIONS[0], {"intent": "я" * 4000, "allowed_journeys": max_journeys(10)}),
    (OPERATIONS[1], {"context": "я" * 4000}),
    (OPERATIONS[3], {"intern_question": "я" * 4000}),
    (
        OPERATIONS[3],
        {
            "goal": {"id": "0000001e-0000-4000-8000-00000000001e", "title": "Ц" * 200},
            "step": {"id": "check_connection", "title": "Ш" * 200},
        },
    ),
    (OPERATIONS[4], {"affected_count": 100, "journey_id": "j" * 64, "step_id": "s" * 64}),
    (
        ("/knowledge/search", {"access_scope": None}, "KnowledgeSearchResponse"),
        {"query": "подключение " * 83, "top_k": 5},
    ),
]


@pytest.mark.parametrize("operation, overrides", MAX_INPUTS)
def test_max_allowed_inputs_give_valid_responses(client, operation, overrides):
    path, body, response_definition = operation
    request = {**with_scope(body), **overrides}
    response = post(client, path, request)
    assert response.status_code == 200, response.text
    assert is_valid(response_definition, response.json())


def test_handler_result_outside_schema_is_not_returned(client, monkeypatch):
    def broken(body):
        return {"blocker_type": "db_ssl_required", "explanation": "x" * 2001, "confidence": "high"}

    monkeypatch.setattr("app.operations.classify_error", broken)
    path, body, _ = OPERATIONS[2]
    error = assert_error(post(client, path, with_scope(body)), 503, "LLM_UNAVAILABLE")
    assert "x" * 10 not in error["message"]


class SlowSource:
    """Источник знаний, который отвечает дольше бюджета."""

    def __init__(self, delay: float):
        self.delay = delay

    async def start(self):
        pass

    async def current(self):
        await asyncio.sleep(self.delay)
        return knowledge()

    def close(self):
        pass


def test_structured_operation_over_budget_is_504():
    app = create_app(make_settings(pipeline_timeout=0.05), source=SlowSource(1.0))
    path, body, _ = OPERATIONS[3]
    response = post(TestClient(app), path, with_scope(body))
    assert_error(response, 504, "LLM_TIMEOUT")


def test_document_get_over_budget_is_504():
    app = create_app(make_settings(pipeline_timeout=0.05), source=SlowSource(1.0))
    response = get_document(TestClient(app), DOC_A, encode_scope(intern_a_scope()))
    assert_error(response, 504, "LLM_TIMEOUT")


def test_budget_spent_before_handler_is_504():
    """Бюджет считается от приёма запроса: если он уже исчерпан, handler не запускается."""
    app = create_app(make_settings(pipeline_timeout=0.0))
    path, body, _ = OPERATIONS[2]
    assert_error(post(TestClient(app), path, with_scope(body)), 504, "LLM_TIMEOUT")
