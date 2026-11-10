.PHONY: install check test up down migrate seed smoke verify-db reset

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

reset:
	@echo 'Удалит ВСЕ локальные данные AI-buddy. Продолжить: make reset CONFIRM=delete-local-data'
	@test "$(CONFIRM)" = "delete-local-data"
	docker compose down --volumes
