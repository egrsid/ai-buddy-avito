import asyncio

import pytest
from ai_test_support import generate_request, intern_a_scope, knowledge
from app.mock_provider import (
    MockProvider,
    ProviderUnavailable,
    mock_answer,
    split_into_chunks,
    unknown_terms,
)
from app.prompt import LlmInput, build_messages


def make_input(request: dict, query: str = "подключение к базе") -> LlmInput:
    hits = knowledge().search(request["access_scope"], query)
    return LlmInput(build_messages(request, hits), request, hits)


def read_chunks(scenario: str) -> list[str]:
    llm_input = make_input(generate_request())

    async def read() -> list[str]:
        return [chunk async for chunk in MockProvider(0.0).stream(llm_input, scenario)]

    return asyncio.run(read())


def test_answer_uses_current_step_blocker_and_sources():
    answer = mock_answer(make_input(generate_request()))
    assert "mock" in answer
    assert "Проверить подключение" in answer
    assert "DB_SSL_REQUIRED" in answer
    assert "Подходящие материалы" in answer
    # Текст пользователя не цитируется, verified не обещается.
    assert "Что делать?" not in answer
    assert "подтверждает только проверка" in answer


def test_answer_without_goal_asks_to_describe_task():
    request = generate_request()
    del request["goal_context"]
    assert "Цель пока не выбрана" in mock_answer(make_input(request))


def test_answer_with_unknown_current_step_and_no_hits():
    request = generate_request()
    request["goal_context"]["current_step_id"] = "missing"
    request["goal_context"]["next_actions"] = []
    answer = mock_answer(LlmInput([], request, []))
    assert "Сейчас твой шаг" not in answer
    assert "Подходящие материалы" not in answer


@pytest.mark.parametrize("term", ["SPT", "ZBP", "avito-cli", "Shatality"])
def test_unknown_internal_terms_are_not_invented(term):
    request = generate_request()
    request["access_scope"] = intern_a_scope()
    request["messages"] = [{"role": "user", "content": f"Что такое {term} и как его настроить?"}]
    llm_input = make_input(request, f"что такое {term}")
    assert unknown_terms(llm_input) == [term]
    assert f"не знаю, что такое {term}" in mock_answer(llm_input)


def test_known_terms_are_not_reported_unknown():
    request = generate_request()
    request["access_scope"] = intern_a_scope()
    request["messages"] = [{"role": "user", "content": "Что значит ssl_mode и db_reader, SSL?"}]
    llm_input = make_input(request, "ssl_mode db_reader")
    assert unknown_terms(llm_input) == []


def test_chunks_join_back_to_text():
    text = "один два три четыре пять шесть семь"
    chunks = split_into_chunks(text)
    assert len(chunks) == 3
    assert "".join(chunks) == text


def test_normal_and_slow_stream_give_same_text():
    assert "".join(read_chunks("normal")) == mock_answer(make_input(generate_request()))
    assert read_chunks("slow_stream") == read_chunks("normal")


def test_unavailable_raises():
    with pytest.raises(ProviderUnavailable):
        read_chunks("unavailable")
