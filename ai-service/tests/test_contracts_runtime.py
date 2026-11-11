from ai_test_support import generate_request
from app.contracts import error_fields, is_valid


def test_contract_example_is_valid():
    assert error_fields("GenerateRequest", generate_request()) == []


def test_missing_scope_is_named_by_schema():
    request = generate_request()
    del request["access_scope"]
    assert {"name": "access_scope", "code": "required"} in error_fields("GenerateRequest", request)


def test_error_fields_do_not_echo_request_values():
    request = generate_request()
    secret = "postgres://user:SECRET@db"
    request["messages"][0]["content"] = secret * 200
    request["Unknown Field"] = secret
    fields = error_fields("GenerateRequest", request)
    assert {"name": "messages", "code": "maxLength"} in fields
    # Имя неизвестного поля не StableId -> безопасное "body".
    assert {"name": "body", "code": "additionalProperties"} in fields
    assert "SECRET" not in str(fields)
    for field in fields:
        assert is_valid(
            "InternalError",
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "x",
                    "request_id": "00000099-0000-4000-8000-000000000099",
                    "fields": [field],
                }
            },
        )


def test_not_an_object():
    assert error_fields("GenerateRequest", []) == [{"name": "body", "code": "type"}]
