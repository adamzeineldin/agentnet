"""Sign-in: signed cookies, open-redirect guard, the OAuth round trip (provider mocked) and the run gate."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.api import auth as auth_api
from app.api import deps
from app.main import create_app
from app.services.auth import providers
from app.services.auth.sessions import safe_next, sign, verify

SECRET = "test-secret"
GITHUB = providers.ProviderConfig("github", "id", "secret", "https://github.com/login/oauth/authorize",
                                  "https://github.com/login/oauth/access_token", "read:user")


def test_signed_tokens_round_trip_and_reject_tampering_and_expiry():
    token = sign({"uid": "github:1"}, SECRET, 60, now=1000)
    assert verify(token, SECRET, now=1001)["uid"] == "github:1"
    assert verify(token, "other-secret", now=1001) is None
    body, mac = token.split(".")
    assert verify(f"{body}x.{mac}", SECRET, now=1001) is None
    assert verify(token, SECRET, now=1061) is None
    assert verify(None, SECRET) is None and verify("garbage", SECRET) is None


@pytest.mark.parametrize("raw,expected", [
    ("/transfer?x=1", "/transfer?x=1"), (None, "/"), ("https://evil.example", "/"),
    ("//evil.example", "/"), ("/\\evil.example", "/"), ("transfer", "/"),
])
def test_safe_next_blocks_open_redirects(raw, expected):
    assert safe_next(raw) == expected


def test_without_providers_sign_in_is_off_and_runs_stay_open():
    with TestClient(create_app()) as c:
        assert c.get("/api/auth/config").json() == {"providers": [], "password": False, "required": False}
        assert c.get("/api/auth/me").json() is None
        assert c.get("/api/auth/login/github").status_code == 404
        assert c.post("/api/library/reports", json={}).status_code == 201


@pytest.fixture()
def gated(monkeypatch):
    monkeypatch.setattr(providers, "configured", lambda: {"github": GITHUB})
    monkeypatch.setattr(deps, "SESSION_SECRET", SECRET)
    monkeypatch.setattr(auth_api, "SESSION_SECRET", SECRET)
    monkeypatch.setattr(providers, "fetch_profile", lambda cfg, code, uri: providers.Profile(
        "github", "4242", "octo", None, "https://avatars.example/octo.png"))
    with TestClient(create_app()) as c:
        yield c


def test_runs_need_sign_in_when_a_provider_is_configured(gated):
    assert gated.get("/api/auth/config").json() == {"providers": ["github"], "password": True, "required": True}
    r = gated.post("/api/runs/discover", json={"robot_id": "panda_01", "scene_seed": 1})
    assert r.status_code == 401 and "Sign in" in r.json()["detail"]
    assert gated.post("/api/robots/ur10e_01/enable").status_code == 401
    assert gated.get("/api/robots").status_code == 200  # browsing stays open


def test_oauth_round_trip_signs_in_and_records_who_started_a_run(gated):
    login = gated.get("/api/auth/login/github?next=/transfer", follow_redirects=False)
    assert login.status_code == 302
    query = parse_qs(urlparse(login.headers["location"]).query)
    assert query["client_id"] == ["id"] and query["redirect_uri"][0].endswith("/api/auth/callback/github")

    bad = gated.get("/api/auth/callback/github?code=c&state=wrong", follow_redirects=False)
    assert bad.status_code == 400

    done = gated.get(f"/api/auth/callback/github?code=c&state={query['state'][0]}", follow_redirects=False)
    assert done.status_code == 302 and done.headers["location"].endswith("/transfer")
    me = gated.get("/api/auth/me").json()
    assert me["user_id"] == "github:4242" and me["name"] == "octo" and "email" not in me

    run = gated.post("/api/robots/panda_01/motion-check", json={}).json()
    assert run["started_by"] == "octo (github)"

    assert gated.post("/api/auth/logout").status_code == 204
    gated.cookies.clear()
    assert gated.get("/api/auth/me").json() is None


def test_after_sign_in_people_land_on_the_app_origin_when_it_differs_from_the_api(gated, monkeypatch):
    # Local dev: the API is on :8000 but the pages are on :3000, so the callback must send people to the pages.
    monkeypatch.setattr(auth_api, "APP_URL", "http://localhost:3000")
    login = gated.get("/api/auth/login/github?next=/lab", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    done = gated.get(f"/api/auth/callback/github?code=c&state={state}", follow_redirects=False)
    assert done.status_code == 302 and done.headers["location"] == "http://localhost:3000/lab"
    login = gated.get("/api/auth/login/github?next=/blog", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    denied = gated.get(f"/api/auth/callback/github?error=access_denied&state={state}", follow_redirects=False)
    assert denied.headers["location"] == "http://localhost:3000/blog"
