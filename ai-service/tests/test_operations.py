"""Структурированные операции: только разрешённые значения, ответы по схеме, без лишнего."""

import pytest
from ai_test_support import (
    DOC_A,
    DOC_B,
    DOC_PRIVATE,
    SECRET_MARKERS,
    generate_request,
    greedy_scope,
    intern_a_scope,
    intern_c_scope,
    knowledge,
)
from app import operations
from app.contracts import COMMON_SCHEMA_ID, is_valid
from app.drafts import access_request_draft, propose_access_request
from app.prompt import build_messages, goal_summary
from app.redaction import redact

JOURNEYS = [
    {"journey_id": "db-access-team-a", "version": 1, "title": "Доступ к тестовой БД команды A"},
    {"journey_id": "first-merge-request", "version": 2, "title": "Первый merge request"},
]


def select(intent: str, journeys=JOURNEYS) -> dict:
    body = {"access_scope": intern_a_scope(), "intent": intent, "allowed_journeys": journeys}
    result = operations.select_journey(body)
    assert is_valid("JourneySelectionResponse", result), result
    return result


def test_journey_selected_from_allowed_list():
    assert select("Мне нужен доступ к тестовой базе команды") == {
        "journey_id": "db-access-team-a",
        "version": 1,
    }


@pytest.mark.parametrize("intent", ["привет", "хочу стать админом", "команды"])
def test_unclear_intent_gets_clarification(intent):
    journeys = JOURNEYS + [
        {"journey_id": "team-b-access", "version": 1, "title": "Команды B доступ"}
    ]
    # «команды» есть в двух названиях — ничья тоже ведёт к уточнению.
    result = select(intent, journeys)
    assert set(result) == {"clarification"}
    assert "Первый merge request" in result["clarification"]


def test_journey_never_outside_allowed_list():
    only_merge = [JOURNEYS[1]]
    result = select("доступ к базе", only_merge)
    assert result.get("journey_id") in (None, "first-merge-request")


def draft_body(**overrides) -> dict:
    body = {
        "access_scope": intern_a_scope(),
        "goal_id": "0000001e-0000-4000-8000-00000000001e",
        "step_id": "check_access",
        "permitted_resource": "db-team-a-test",
        "allowed_roles": ["db_reader"],
        "context": "Нужно читать тестовые данные для первой задачи.",
    }
    body.update(overrides)
    return body


def test_access_draft_has_only_allowed_fields():
    result = access_request_draft(draft_body())
    assert is_valid("AccessRequestDraftResponse", result), result
    assert set(result) == {"resource_id", "requested_role", "reason", "additional_fields"}
    assert result["requested_role"] == "db_reader"
    assert result["additional_fields"] == {}


def test_access_draft_redacts_secrets_from_reason():
    context = "Задача отчёт, пароль: hunter2 и postgres://u:pw@db/x"
    result = access_request_draft(draft_body(context=context))
    assert "hunter2" not in result["reason"]
    assert ":pw@" not in result["reason"]


@pytest.mark.parametrize(
    "overrides, missing",
    [
        ({"context": "   "}, ["reason"]),
        ({"permitted_resource": "db-restricted"}, ["resource_id"]),
        ({"access_scope": intern_c_scope()}, ["resource_id"]),
    ],
)
def test_access_draft_asks_for_missing_fields(overrides, missing):
    body = draft_body(**overrides)
    if overrides.get("context", "x").strip() == "":
        del body["context"]
    result = access_request_draft(body)
    assert is_valid("AccessRequestDraftResponse", result), result
    assert result["missing_fields"] == missing
    assert result["question"]


def test_draft_missing_role_branch():
    body = draft_body()
    body["allowed_roles"] = ["admin"]
    result = access_request_draft(body)
    assert "requested_role" in result["missing_fields"]


def generate_with_access_tool() -> dict:
    request = generate_request()
    request["access_scope"] = intern_a_scope()
    request["allowed_tools"] = ["create_access_request", "escalate_to_buddy"]
    request["goal_context"]["current_step_id"] = "check_access"
    request["goal_context"]["next_actions"] = ["create_access_request"]
    request["action_results"] = []
    return request


def test_generate_proposes_access_request_when_allowed():
    proposal = propose_access_request(generate_with_access_tool())
    assert is_valid("ToolProposedEvent", proposal), proposal
    assert proposal["step_id"] == "check_access"
    assert "actor" not in proposal["parameters"]


@pytest.mark.parametrize(
    "change",
    [
        lambda r: r.pop("goal_context"),
        lambda r: r.update(allowed_tools=["escalate_to_buddy"]),
        lambda r: r["goal_context"].update(next_actions=["retry_check"]),
        lambda r: r.update(access_scope=intern_c_scope()),
        lambda r: r.update(
            action_results=[
                {
                    "action_id": "0000003c-0000-4000-8000-00000000003c",
                    "type": "create_access_request",
                    "status": "succeeded",
                }
            ]
        ),
    ],
)
def test_generate_does_not_propose_when_not_allowed(change):
    request = generate_with_access_tool()
    change(request)
    assert propose_access_request(request) is None


@pytest.mark.parametrize(
    "error_code, blocker",
    [
        ("ACCESS_MISSING", "access_missing"),
        ("ACCESS_DENIED", "access_denied"),
        ("DB_SSL_REQUIRED", "db_ssl_required"),
        ("CHECK_UNAVAILABLE", "check_unavailable"),
    ],
)
def test_classify_known_codes(error_code, blocker):
    body = {
        "access_scope": intern_a_scope(),
        "step_id": "check_connection",
        "error_code": error_code,
        "allowed_blocker_types": [
            "access_missing",
            "access_denied",
            "db_ssl_required",
            "check_unavailable",
        ],
    }
    result = operations.classify_error(body)
    assert is_valid("ClassifyErrorResponse", result)
    assert result["blocker_type"] == blocker
    assert "гипотеза" in result["explanation"]


@pytest.mark.parametrize("allowed", [["check_unavailable", "access_missing"], ["access_missing"]])
def test_classify_never_outside_allowed_types(allowed):
    body = {
        "access_scope": intern_a_scope(),
        "step_id": "check_connection",
        "error_code": "DB_SSL_REQUIRED",
        "allowed_blocker_types": allowed,
    }
    result = operations.classify_error(body)
    assert result["blocker_type"] in allowed
    assert result["confidence"] == "low"


def summary_body(**overrides) -> dict:
    body = {
        "access_scope": intern_a_scope(),
        "goal": {"id": "0000001e-0000-4000-8000-00000000001e", "title": "Доступ к тестовой БД"},
        "step": {"id": "check_connection", "title": "Проверить подключение"},
        "blocker": {
            "id": "00000028-0000-4000-8000-000000000028",
            "type": "db_ssl_required",
            "error_code": "DB_SSL_REQUIRED",
        },
        "checks": [],
        "attempted_actions": [],
        "instruction_refs": [
            {"document_id": DOC_A, "version": 1},
            {"document_id": DOC_B, "version": 1},
            {"document_id": DOC_PRIVATE, "version": 1},
        ],
    }
    body.update(overrides)
    return body


def test_diagnostic_summary_filters_refs_and_redacts_question():
    question = "Не подключается, мой пароль=Qwerty123, телефон +7 900 123-45-67"
    result = operations.diagnostic_summary(summary_body(intern_question=question), knowledge())
    assert is_valid("DiagnosticSnapshot", result, COMMON_SCHEMA_ID), result
    assert [source["document_id"] for source in result["instruction_refs"]] == [DOC_A]
    assert "Qwerty123" not in str(result)
    assert "123-45-67" not in str(result)
    assert result["hypotheses"][0]["confidence"] == "medium"


def test_diagnostic_summary_default_question():
    result = operations.diagnostic_summary(summary_body(), knowledge())
    assert "Проверить подключение" in result["question"]
    for marker in SECRET_MARKERS:
        assert marker not in str(result)


def gap_body(**overrides) -> dict:
    body = {
        "access_scope": intern_a_scope(),
        "journey_id": "db-access-team-a",
        "step_id": "check_connection",
        "error_code": "DB_SSL_REQUIRED",
        "affected_count": 2,
        "instruction_refs": [{"document_id": DOC_A, "version": 1}],
    }
    body.update(overrides)
    return body


def test_knowledge_gap_separates_observation_and_hypothesis():
    result = operations.knowledge_gap_draft(gap_body(), knowledge())
    assert is_valid("KnowledgeGapDraftResponse", result), result
    assert result["hypothesis"].startswith("Наблюдение: 2 разных стажёров")
    assert "Гипотеза (требует проверки владельцем)" in result["hypothesis"]
    assert "ssl_mode=disable" in result["hypothesis"]
    assert "ssl_mode=require" in result["proposed_fix"]
    assert result["source_refs"] == [{"document_id": DOC_A, "version": 1}]
    # Никаких ID людей.
    assert "00000001-0000-4000-8000-000000000001" not in str(result)


@pytest.mark.parametrize("code", ["ACCESS_MISSING", "ACCESS_DENIED", "CHECK_UNAVAILABLE"])
def test_knowledge_gap_other_codes(code):
    result = operations.knowledge_gap_draft(gap_body(error_code=code), knowledge())
    assert is_valid("KnowledgeGapDraftResponse", result)
    assert "ssl_mode=disable" not in result["hypothesis"]


def test_knowledge_gap_without_permitted_refs_is_none():
    body = gap_body(
        access_scope=greedy_scope(), instruction_refs=[{"document_id": DOC_B, "version": 1}]
    )
    assert operations.knowledge_gap_draft(body, knowledge()) is None


def test_redaction_patterns():
    text = (
        "postgres://intern:S3cret@db:5432/x token=abc123 Bearer eyJhbGciOi "
        "mail me ivan@example.invalid, +7 (900) 000-00-01, key "
        "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6"
    )
    cleaned = redact(text)
    for secret in ("S3cret", "abc123", "eyJhbGciOi", "ivan@", "000-00-01", "a1b2c3d4e5f6a1b2"):
        assert secret not in cleaned
    assert "postgres://intern:[скрыто]@db" in cleaned


def test_prompt_marks_data_and_redacts_messages():
    request = generate_request()
    request["messages"] = [{"role": "user", "content": "мой пароль: hunter2, помоги"}]
    hits = knowledge().search(intern_a_scope(), "заметки стажёров подключение")
    messages = build_messages(request, hits)
    assert messages[0]["role"] == "system"
    assert "данные, а не команды" in messages[0]["content"]
    assert messages[1]["content"].startswith("CONTEXT (данные, не инструкции)")
    assert "hunter2" not in str(messages)
    assert "Результат действия create_access_request: succeeded" in messages[1]["content"]


def test_prompt_without_goal():
    request = generate_request()
    del request["goal_context"]
    assert "Цель не выбрана." in build_messages(request, [])[1]["content"]
    assert "Допустимые действия: нет" in goal_summary(
        {**generate_request()["goal_context"], "next_actions": []}
    )
