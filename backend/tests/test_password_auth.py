"""Email + password accounts: hashing, register / sign in, the session they start, and the attempt limits."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.api import auth as auth_api
from app.api import deps
from app.api import password_auth
from app.main import create_app
from app.services.auth.passwords import AttemptLimiter, hash_password, normalize_email, verify_password

SECRET = "test-secret"
PASSWORD = "correct horse battery"


def test_passwords_are_salted_hashes_that_verify_only_the_right_password():
    one, two = hash_password("hunter2hunter2"), hash_password("hunter2hunter2")
    assert one != two and "hunter2" not in one and one.startswith("scrypt$")
    assert verify_password("hunter2hunter2", one) and not verify_password("hunter2hunter3", one)
    assert not verify_password("x", "garbage") and not verify_password("x", "")


def test_emails_are_compared_trimmed_and_case_insensitive():
    assert normalize_email("  Ada@Example.COM ") == "ada@example.com"


def test_attempt_limiter_blocks_after_the_limit_and_forgets_after_the_window():
    limiter = AttemptLimiter(limit=2, window_s=60)
    assert limiter.allowed("k", now=0) and limiter.hit("k", now=0) is None
    limiter.hit("k", now=1)
    assert not limiter.allowed("k", now=2) and limiter.allowed("k", now=62)


@pytest.fixture()
def accounts(monkeypatch):
    monkeypatch.setattr(deps, "SESSION_SECRET", SECRET)
    monkeypatch.setattr(auth_api, "SESSION_SECRET", SECRET)
    password_auth.FAILURES.clear()
    password_auth.SIGNUPS.clear()
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def ada() -> dict[str, str]:
    """A fresh account per test: the test database is shared by the whole run."""
    return {"name": "Ada", "email": f"Ada.{uuid.uuid4().hex[:8]}@Example.com", "password": PASSWORD}


def test_without_a_session_secret_email_accounts_are_off(ada):
    with TestClient(create_app()) as c:
        assert c.get("/api/auth/config").json() == {"providers": [], "password": False, "required": False}
        assert c.post("/api/auth/register", json=ada).status_code == 404


def test_with_a_session_secret_email_accounts_are_on_and_the_lab_needs_one(accounts):
    assert accounts.get("/api/auth/config").json() == {"providers": [], "password": True, "required": True}
    assert accounts.post("/api/runs/discover", json={"robot_id": "panda_01", "scene_seed": 1}).status_code == 401


def test_register_signs_you_in_and_never_exposes_the_email_or_password(accounts, ada):
    made = accounts.post("/api/auth/register", json=ada)
    assert made.status_code == 201
    body = made.json()
    assert body["name"] == "Ada" and body["provider"] == "email" and "email" not in body and "password" not in body
    assert accounts.get("/api/auth/me").json()["user_id"] == body["user_id"]
    stored = accounts.app.state.registry.get_credential(ada["email"].lower())
    assert stored and PASSWORD not in stored.password_hash


def test_one_account_per_email(accounts, ada):
    accounts.post("/api/auth/register", json=ada)
    again = accounts.post("/api/auth/register", json={**ada, "email": f" {ada['email'].lower()}"})
    assert again.status_code == 409 and "Sign in" in again.json()["detail"]


@pytest.mark.parametrize("change", [
    {"email": "not-an-email"}, {"password": "short"}, {"password": "x" * 129},
    {"name": "  "}, {"name": "n" * 61}, {"name": None},
])
def test_registration_is_validated(accounts, ada, change):
    body = {k: v for k, v in {**ada, **change}.items() if v is not None}
    assert accounts.post("/api/auth/register", json=body).status_code == 422


def test_sign_in_with_the_right_password_only_and_one_message_for_every_failure(accounts, ada):
    user = accounts.post("/api/auth/register", json=ada).json()
    accounts.post("/api/auth/logout")
    accounts.cookies.clear()
    wrong = accounts.post("/api/auth/signin", json={"email": ada["email"], "password": "wrong password!"})
    unknown = accounts.post("/api/auth/signin", json={"email": "nobody@example.com", "password": "whatever123"})
    assert wrong.status_code == unknown.status_code == 401 and wrong.json() == unknown.json()
    ok = accounts.post("/api/auth/signin", json={"email": ada["email"].upper(), "password": PASSWORD})
    assert ok.status_code == 200 and ok.json()["user_id"] == user["user_id"]
    assert accounts.get("/api/auth/me").json()["name"] == "Ada"


def test_repeated_wrong_passwords_lock_that_email_for_a_while(accounts, ada, monkeypatch):
    monkeypatch.setattr(password_auth, "FAILURES", AttemptLimiter(limit=3, window_s=900))
    accounts.post("/api/auth/register", json=ada)
    codes = [accounts.post("/api/auth/signin", json={"email": ada["email"], "password": "nope nope"}).status_code
             for _ in range(4)]
    assert codes == [401, 401, 401, 429]
    right = accounts.post("/api/auth/signin", json={"email": ada["email"], "password": PASSWORD})
    assert right.status_code == 429


def test_sign_ups_per_address_are_capped(accounts, ada, monkeypatch):
    monkeypatch.setattr(password_auth, "SIGNUPS", AttemptLimiter(limit=2, window_s=3600))
    codes = [accounts.post("/api/auth/register", json={**ada, "email": f"{i}.{ada['email']}"}).status_code
             for i in range(3)]
    assert codes == [201, 201, 429]
