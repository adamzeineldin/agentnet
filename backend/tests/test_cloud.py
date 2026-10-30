"""Single-container cloud mode: the backend serves the static site, and job submissions are capped."""

from __future__ import annotations

import threading

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api import deps
from app.main import create_app
from app.services.jobs import SimulationWorker


@pytest.fixture()
def web_dir(tmp_path):
    (tmp_path / "_next").mkdir()
    (tmp_path / "index.html").write_text("<h1>home</h1>")
    (tmp_path / "real.html").write_text("<h1>real data</h1>")
    (tmp_path / "404.html").write_text("<h1>not found</h1>")
    (tmp_path / "_next" / "app.js").write_text("console.log(1)")
    (tmp_path.parent / "secret.txt").write_text("nope")
    return tmp_path


def test_static_site_and_api_share_one_origin(web_dir):
    with TestClient(create_app(web_dir=web_dir)) as c:
        assert c.get("/").text == "<h1>home</h1>"
        assert c.get("/real").text == "<h1>real data</h1>"
        assert c.get("/_next/app.js").text == "console.log(1)"
        missing = c.get("/no-such-page")
        assert missing.status_code == 404 and "not found" in missing.text
        assert c.get("/api/health").json()["status"] == "ok"
        assert c.get("/api/no-such-endpoint").status_code == 404
        assert c.get("/..%2Fsecret.txt").status_code == 404


def test_without_a_web_dir_only_the_api_is_served():
    with TestClient(create_app(web_dir=None)) as c:
        assert c.get("/").status_code == 404


def test_worker_counts_pending_jobs_and_the_job_gate_refuses_when_full(monkeypatch):
    worker = SimulationWorker()
    release = threading.Event()
    try:
        worker.submit(release.wait)
        worker.submit(release.wait)
        assert worker.pending == 2
        monkeypatch.setattr(deps, "MAX_PENDING_JOBS", 2)
        with pytest.raises(HTTPException) as exc:
            deps.check_capacity(worker)
        assert exc.value.status_code == 429 and "busy" in exc.value.detail
        monkeypatch.setattr(deps, "MAX_PENDING_JOBS", 0)  # 0 = unlimited (local default)
        deps.check_capacity(worker)
    finally:
        release.set()
        worker.shutdown()
    assert worker.pending == 0
