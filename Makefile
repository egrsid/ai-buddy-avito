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

demo-offline:
	python3 -m scripts.demo up --offline

.PHONY: live-demo live-demo-down live-demo-check
# Live LLM demo (real GigaChat chain); settings only from .env, checked before Docker.
live-demo:
	python3 -m scripts.live_demo up

live-demo-down:
	python3 -m scripts.live_demo down

live-demo-check:
	python3 -m scripts.live_demo check

.PHONY: main-demo
main-demo:
	@test "$$(git branch --show-current)" = main || (echo 'Run main-demo from the main checkout'; exit 1)
	python3 -m scripts.demo up --offline

# V4 actual LLM and synthetic cohort histories are separate, explicit launch profiles.
V4_LIVE_ENV ?= .env.live-v4
V4_LIVE_PROJECT ?= ai-buddy-live-v4
V4_CACHED_BUILD ?= --cached-build
.PHONY: v4-live-preflight v4-live-up v4-live-check v4-live-evals v4-live-budget v4-live-restart v4-cohorts
v4-live-preflight:
	uv run --frozen python -m scripts.v4_live_acceptance --env-file $(V4_LIVE_ENV) --project $(V4_LIVE_PROJECT) --preflight-only --output .cache/v4-live-preflight.json
v4-live-up: v4-live-preflight
	python3 -m scripts.live_demo up --env-file $(V4_LIVE_ENV) --project $(V4_LIVE_PROJECT) $(V4_CACHED_BUILD)
v4-live-check:
	uv run --frozen python -m scripts.v4_live_acceptance --env-file $(V4_LIVE_ENV) --project $(V4_LIVE_PROJECT)
v4-live-evals:
	python3 -m scripts.live_demo evals --env-file $(V4_LIVE_ENV) --project $(V4_LIVE_PROJECT)
v4-live-budget:
	python3 -m scripts.live_demo budget --env-file $(V4_LIVE_ENV) --project $(V4_LIVE_PROJECT)
v4-live-restart:
	python3 -m scripts.live_demo restart --env-file $(V4_LIVE_ENV) --project $(V4_LIVE_PROJECT)
v4-cohorts:
	uv run --frozen python -m scripts.v4_cohorts up
