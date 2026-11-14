"""Acceptance runner safety; all HTTP responses here are explicit test doubles, no paid calls."""

import json
from unittest.mock import Mock

import httpx
import pytest

from scripts import v4_live_acceptance as live

VALUES = {
    "LLM_BASE_URL": "https://provider.invalid/v1",
    "LLM_API_KEY": "never-print-this",
    "LLM_MODEL": "primary",
    "EMBEDDING_MODEL": "embedding",
    "LLM_FALLBACK_MODEL": "secondary",
}


def good_case():
    return {
        "completion": "completed",
        "origin": {"answered_by": "primary", "completion": "completed"},
        "citation_count": 1,
        "citations_reauthorized": True,
        "first_content_seconds": 1,
        "duration_seconds": 2,
        "usage": [{"actual_rub": 0.01}],
    }


@pytest.mark.parametrize(
    "patch",
    [
        {"origin": {"answered_by": "secondary", "completion": "completed"}},
        {"origin": {"answered_by": "offline"}},
        {"citation_count": 0},
        {"citations_reauthorized": False},
        {"first_content_seconds": None},
        {"first_content_seconds": 21},
        {"duration_seconds": 91},
        {"completion": "failed"},
        {"usage": []},
        {"usage": [{"actual_rub": None}]},
    ],
)
def test_fallback_or_unknown_usage_cannot_pass_the_primary_gate(patch):
    assert live.primary_passed(good_case())
    assert not live.primary_passed({**good_case(), **patch})


def test_free_catalog_checks_all_configured_models_without_error_body():
    transport = httpx.MockTransport(
        lambda r: httpx.Response(
            200, json={"data": [{"id": name} for name in ("primary", "embedding", "secondary")]}
        )
    )
    assert live.catalog(VALUES, transport)["ok"]
    assert not live.catalog({**VALUES, "LLM_MODEL": "absent"}, transport)["ok"]
    refused = live.catalog(
        VALUES, httpx.MockTransport(lambda r: httpx.Response(401, text=VALUES["LLM_API_KEY"]))
    )
    assert refused == {"ok": False, "http_status": 401}
    assert VALUES["LLM_API_KEY"] not in json.dumps(refused)


def test_catalog_connection_failure_is_safe():
    def down(request):
        raise httpx.ConnectTimeout("private provider diagnostic")

    assert live.catalog(VALUES, httpx.MockTransport(down)) == {
        "ok": False,
        "error": "ConnectTimeout",
    }


def test_chat_reads_real_go_sse_shape_and_reauthorizes_citations():
    def handler(request):
        path = request.url.path
        if path.endswith("demo-login"):
            return httpx.Response(200, json={"csrf_token": "csrf"})
        if request.method == "POST" and path.endswith("conversations"):
            return httpx.Response(201, json={"id": "conversation"})
        if request.method == "POST" and path.endswith("runs"):
            return httpx.Response(201, json={"id": "run"})
        if path.endswith("/events"):
            return httpx.Response(
                200,
                text=(
                    'event: message.delta\ndata: {"text":"SSL"}\n\n'
                    "event: run.completed\ndata: {}\n\n"
                ),
            )
        if path.endswith("/messages"):
            return httpx.Response(
                200,
                json={
                    "items": [{"id": "message", "sources": [{"document_id": "doc", "version": 1}]}]
                },
            )
        if path.endswith("message-origins"):
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "run_id": "run",
                            "origin": {"answered_by": "primary", "completion": "completed"},
                        }
                    ]
                },
            )
        if path.endswith("knowledge/doc"):
            return httpx.Response(200, json={"version": 1})
        return httpx.Response(200, json={"status": "completed", "assistant_message_id": "message"})

    actor = live.Actor("http://test.invalid", "intern-d", httpx.MockTransport(handler))
    try:
        case = live.chat_case(actor, "goal", "synthetic question", "primary-01")
        assert case["run_id"] == "run" and case["citation_count"] == 1
        assert case["citations_reauthorized"] and case["first_content_seconds"] is not None
        assert "synthetic question" not in json.dumps(case)
    finally:
        actor.close()


def test_catalog_failure_stops_before_application_or_paid_calls(monkeypatch):
    monkeypatch.setattr(live, "catalog", lambda values: {"ok": False})
    monkeypatch.setattr(live, "Actor", pytest.fail)
    result = {"cases": [], "provider_calls_executed": False}
    live.run(VALUES, [], {}, 10, result)
    assert result["provider_calls_executed"] is False and result["cases"] == []


def test_actor_rejects_http_errors_without_printing_body():
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"csrf_token": "csrf"}))
    actor = live.Actor("http://test.invalid", "intern-d", transport)
    actor.client.close()
    actor.client = httpx.Client(
        base_url="http://test.invalid",
        transport=httpx.MockTransport(lambda r: httpx.Response(403, text="private")),
    )
    try:
        assert actor.call("GET", "/foreign", expected=403)
        with pytest.raises(live.AcceptanceFailure, match="HTTP_403"):
            actor.call("GET", "/foreign")
    finally:
        actor.close()


def test_main_missing_configuration_writes_blocked_safe_manifest(tmp_path, monkeypatch):
    monkeypatch.setattr(live, "manifest", lambda: {"status": "blocked", "cases": []})
    path = tmp_path / "missing.json"
    assert live.main(["--env-file", str(tmp_path / "absent"), "--output", str(path)]) == 2
    assert json.loads(path.read_text())["error"] == "FileNotFoundError"


def test_safe_ledger_reader_does_not_print_compose_environment(monkeypatch):
    call = Mock(return_value=Mock(stdout='[{"rowid":1}]'))
    monkeypatch.setattr(live.subprocess, "run", call)
    assert live.ledger_rows(["docker", "compose"], {"LLM_API_KEY": "private"}) == [{"rowid": 1}]
    assert call.call_args.kwargs["capture_output"] is True
