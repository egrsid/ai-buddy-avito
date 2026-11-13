"""HTTP-уровень /internal/v2/generate: порядок ошибок до потока и сам поток."""

import json
import uuid

import pytest
from ai_test_support import REQUEST_ID, TOKEN, generate_request, make_settings, parse_sse
from app.api import create_app
from app.contracts import is_valid
from fastapi.testclient import TestClient

URL = "/internal/v2/generate"


def client(**settings) -> TestClient:
    return TestClient(create_app(make_settings(**settings)))


def headers(**extra) -> dict:
    values = {"Authorization": f"Bearer {TOKEN}", "X-Request-ID": REQUEST_ID}
    values.update(extra)
    return values


def post(test_client, body, request_headers):
    if not isinstance(body, (str, bytes)):
        body = json.dumps(body, ensure_ascii=False)
    request_headers = {"Content-Type": "application/json", **request_headers}
    return test_client.post(URL, content=body, headers=request_headers)


def assert_error(response, status, code):
    assert response.status_code == status
    body = response.json()
    assert is_valid("InternalError", body), body
    assert body["error"]["code"] == code
    assert response.headers["X-Request-ID"] == body["error"]["request_id"]
    return body["error"]


def test_healthz_without_token():
    response = client().get("/healthz")
    assert response.json() == {"status": "ok", "service": "ai-service"}


@pytest.mark.parametrize(
    "auth",
    [None, "Bearer wrong", f"Basic {TOKEN}", f"bearer {TOKEN}"],
)
def test_bad_token_is_401_with_request_id(auth):
    request_headers = headers()
    if auth is None:
        del request_headers["Authorization"]
    else:
        request_headers["Authorization"] = auth
    # Даже при битом JSON первым проверяется токен.
    error = assert_error(post(client(), "{", request_headers), 401, "UNAUTHENTICATED")
    assert error["request_id"] == REQUEST_ID


def test_bad_token_and_bad_id_get_new_id():
    response = post(client(), "{", {"Authorization": "Bearer wrong", "X-Request-ID": "abc"})
    error = assert_error(response, 401, "UNAUTHENTICATED")
    assert error["request_id"] != "abc"


@pytest.mark.parametrize("request_id", ["not-a-uuid", str(uuid.uuid1()), "<script>"])
def test_bad_request_id_is_400_and_not_echoed(request_id):
    response = post(client(), generate_request(), headers(**{"X-Request-ID": request_id}))
    assert_error(response, 400, "INVALID_REQUEST_ID")
    assert request_id not in response.text
    assert request_id not in response.headers["X-Request-ID"]


def test_missing_request_id_is_400():
    request_headers = headers()
    del request_headers["X-Request-ID"]
    assert_error(post(client(), generate_request(), request_headers), 400, "INVALID_REQUEST_ID")


def test_two_request_ids_are_rejected():
    test_client = client()
    request_headers = [
        ("Authorization", f"Bearer {TOKEN}"),
        ("X-Request-ID", REQUEST_ID),
        ("X-Request-ID", REQUEST_ID),
    ]
    response = test_client.post(
        URL, content=json.dumps(generate_request()), headers=request_headers
    )
    assert_error(response, 400, "INVALID_REQUEST_ID")


def test_uppercase_request_id_is_normalized():
    response = post(client(), generate_request(), headers(**{"X-Request-ID": REQUEST_ID.upper()}))
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == REQUEST_ID


@pytest.mark.parametrize("raw", ["{", "", '{"a": NaN}', b"\xff\xfe"])
def test_bad_json_is_400(raw):
    error = assert_error(post(client(), raw, headers()), 400, "INVALID_JSON")
    assert error["request_id"] == REQUEST_ID


def test_missing_scope_is_422():
    request = generate_request()
    del request["access_scope"]
    error = assert_error(post(client(), request, headers()), 422, "VALIDATION_ERROR")
    assert {"name": "access_scope", "code": "required"} in error["fields"]


def test_messages_total_limit_is_422():
    request = generate_request()
    request["messages"] = [{"role": "user", "content": "а" * 3500} for _ in range(4)]
    error = assert_error(post(client(), request, headers()), 422, "VALIDATION_ERROR")
    assert error["fields"] == [{"name": "messages", "code": "maxTotalLength"}]


def test_schema_error_comes_before_mock_header_check():
    response = post(client(), {}, headers(**{"X-Mock-Scenario": "timeout"}))
    assert_error(response, 422, "VALIDATION_ERROR")


def test_mock_header_forbidden_when_faults_disabled():
    response = post(client(), generate_request(), headers(**{"X-Mock-Scenario": "normal"}))
    assert_error(response, 403, "FORBIDDEN")


def test_unknown_mock_scenario_is_422():
    response = post(
        client(mock_faults_enabled=True), generate_request(), headers(**{"X-Mock-Scenario": "boom"})
    )
    error = assert_error(response, 422, "VALIDATION_ERROR")
    assert error["fields"] == [{"name": "x-mock-scenario", "code": "enum"}]


def test_stream_headers_and_events():
    response = post(client(), generate_request(), headers())
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-accel-buffering"] == "no"
    assert response.headers["x-request-id"] == REQUEST_ID
    items = parse_sse(response.text)
    assert items[0]["event"] == "run.started"
    assert items[-1]["event"] == "generation.completed"


def test_mock_scenario_unavailable_over_http():
    response = post(
        client(mock_faults_enabled=True),
        generate_request(),
        headers(**{"X-Mock-Scenario": "unavailable"}),
    )
    assert response.status_code == 200
    items = parse_sse(response.text)
    assert [item["event"] for item in items] == ["run.started", "run.failed"]
    assert items[-1]["data"]["code"] == "LLM_UNAVAILABLE"
