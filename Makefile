PY := backend/.venv/bin/python

.PHONY: setup models backend-deps frontend-deps dev test smoke discover transfer lint build

setup: backend-deps models frontend-deps ## one-time install

backend-deps:
	test -d backend/.venv || python3.13 -m venv backend/.venv
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -e "backend[dev]"

models:
	backend/scripts/fetch_models.sh

frontend-deps:
	npm --prefix frontend install

dev: ## backend :8000 + frontend :3000
	scripts/dev.sh

test:
	cd backend && .venv/bin/python -m pytest

smoke:
	cd backend && .venv/bin/python scripts/smoke_sim.py

discover:
	cd backend && .venv/bin/python scripts/discover_skill.py --seed 42 --publish

transfer:
	cd backend && .venv/bin/python scripts/transfer_demo.py --seed 7 --publish

lint:
	npm --prefix frontend run lint

build:
	npm --prefix frontend run build
