PY := backend/.venv/bin/python
PYTHON ?= python3.13
DEMO_ENV := NIMBOTICS_DB_PATH=$(CURDIR)/backend/app/data/demo/nimbotics.db NIMBOTICS_ARTIFACT_DIR=$(CURDIR)/backend/app/data/demo/artifacts \
	DATABASE_URL= NIMBOTICS_S3_BUCKET=

.PHONY: setup models backend-deps frontend-deps dev test smoke discover transfer benchmark e2e demo-seed demo demo-check lint build ursim-up ursim-down

setup: backend-deps models frontend-deps ## one-time install

backend-deps:
	test -d backend/.venv || $(PYTHON) -m venv backend/.venv
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

benchmark:
	cd backend && .venv/bin/python scripts/benchmark.py

e2e:
	cd frontend && npx playwright install chromium && npx playwright test

demo-seed: ## clean registry with real recorded runs for the video
	cd backend && $(DEMO_ENV) .venv/bin/python scripts/seed_demo.py --reset

demo: ## production frontend + backend on the demo registry
	scripts/demo.sh

demo-check: ## repeat the demo chain and check it is stable
	cd backend && .venv/bin/python scripts/demo_check.py

lint:
	npm --prefix frontend run lint

build:
	npm --prefix frontend run build

ursim-up: ## URSim (UR controller software) + ur_rtde bridge on :8765; enable Remote Control once at :6080
	docker compose -f backend/ur_bridge/compose.yaml up -d --build

ursim-down:
	docker compose -f backend/ur_bridge/compose.yaml down
