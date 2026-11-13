.PHONY: install check test up down migrate seed smoke verify-db reset mvp-preflight mvp-up ai-db-test demo-up demo-down

MVP_COMPOSE = docker compose -f compose.yaml -f compose.mvp.yaml
AI_INGEST_COMMAND ?= ["python","-m","app.ingest"]
AI_DB_TEST_COMMAND ?= ["python","-m","pytest","ai-service/tests/test_kb_integration.py","-q"]
export AI_INGEST_COMMAND AI_DB_TEST_COMMAND

install:
	uv sync --frozen
	cd frontend && npm ci

check:
	uv run --frozen python -m scripts.check_repo
	uv run --frozen ruff check scripts tests ai-service mock-services
	uv run --frozen ruff format --check scripts tests ai-service mock-services
	uv run --frozen pytest tests -q

test: check
	uv run --frozen python -m scripts.check_components backend
	uv run --frozen python -m scripts.check_components ai
	uv run --frozen python -m scripts.check_components mock
	uv run --frozen python -m scripts.check_components frontend

up:
	docker compose up --build -d --wait

down:
	docker compose down

migrate:
	docker compose run --rm migrate

seed:
	docker compose run --rm seed

smoke:
	python3 -m scripts.smoke

verify-db:
	docker compose run --rm migrate python -m scripts.verify_db

mvp-preflight:
	uv run --frozen python -m scripts.mvp_preflight

mvp-up: mvp-preflight
	$(MVP_COMPOSE) up --build -d --wait

ai-db-test:
	$(MVP_COMPOSE) --profile acceptance run --build --rm ai-db-tests

reset:
	@echo 'Удалит ВСЕ локальные данные AI-buddy. Продолжить: make reset CONFIRM=delete-local-data'
	@test "$(CONFIRM)" = "delete-local-data"
	docker compose down --volumes

demo-up:
	python3 -m scripts.demo up

demo-down:
	python3 -m scripts.demo down
