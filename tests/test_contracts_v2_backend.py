"""Positive and negative fixtures for the Backend v2 contracts."""

import urllib.request

import pytest

from tests.contract_v2_support import check_backend_contracts


def test_backend_v2_contracts_match_local_schemas():
    check_backend_contracts()


def test_backend_v2_validation_does_not_fetch_schemas(monkeypatch: pytest.MonkeyPatch):
    def refuse(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("v2 schema validation tried to use the network")

    monkeypatch.setattr(urllib.request, "urlopen", refuse)
    check_backend_contracts()
