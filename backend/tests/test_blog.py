"""Blog: anyone reads; writing needs a signed-in user when sign-in is on; only the author edits or deletes."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.api import blog as blog_api
from app.api import deps
from app.main import create_app
from app.models.user import User
from app.services.auth import providers
from app.services.auth.sessions import sign

SECRET = "test-secret"
GOOGLE = providers.ProviderConfig("google", "id", "secret", "https://accounts.google.com/o/oauth2/v2/auth",
                                  "https://oauth2.googleapis.com/token", "openid profile")
POST = {"title": "What the UR5e learned", "body": "It went over the wall.\n\nThen it saved the skill."}


def _sign_in(client: TestClient, uid: str, name: str) -> None:
    now = datetime.now(UTC)
    client.app.state.registry.save_user(User(user_id=uid, provider="google", name=name, email=f"{name}@example.com",
                                             avatar_url=None, created_at=now, last_login_at=now))
    client.cookies.set(deps.SESSION_COOKIE, sign({"uid": uid}, SECRET, 3600))


@pytest.fixture()
def gated(monkeypatch):
    monkeypatch.setattr(providers, "configured", lambda: {"google": GOOGLE})
    monkeypatch.setattr(deps, "SESSION_SECRET", SECRET)
    with TestClient(create_app()) as c:
        yield c


def test_without_sign_in_anyone_writes_as_a_guest_and_reads_back():
    with TestClient(create_app()) as c:
        made = c.post("/api/blog", json=POST)
        assert made.status_code == 201
        post = made.json()
        assert post["author_name"] == "Guest" and post["title"] == POST["title"]
        assert c.get(f"/api/blog/{post['post_id']}").json()["body"] == POST["body"]
        listed = next(p for p in c.get("/api/blog").json() if p["post_id"] == post["post_id"])
        assert listed["excerpt"].startswith("It went over the wall.") and "body" not in listed
        assert c.get("/api/blog/post_missing").status_code == 404


@pytest.mark.parametrize("bad", [
    {"title": "   ", "body": "x"}, {"title": "t", "body": ""}, {"title": "t" * 121, "body": "x"},
    {"title": "t", "body": "x" * 20_001}, {"title": "t"},
])
def test_posts_are_validated(bad):
    with TestClient(create_app()) as c:
        assert c.post("/api/blog", json=bad).status_code == 422


def test_with_sign_in_on_reading_is_open_but_writing_needs_an_account(gated):
    assert gated.get("/api/blog").status_code == 200
    assert gated.post("/api/blog", json=POST).status_code == 401
    _sign_in(gated, "google:1", "ada")
    post = gated.post("/api/blog", json=POST).json()
    assert post["author_name"] == "ada" and post["author_id"] == "google:1" and "email" not in str(post)


def test_only_the_author_edits_or_deletes(gated):
    _sign_in(gated, "google:1", "ada")
    post = gated.post("/api/blog", json=POST).json()
    _sign_in(gated, "google:2", "grace")
    assert gated.put(f"/api/blog/{post['post_id']}", json={**POST, "title": "Mine now"}).status_code == 403
    assert gated.delete(f"/api/blog/{post['post_id']}").status_code == 403
    _sign_in(gated, "google:1", "ada")
    edited = gated.put(f"/api/blog/{post['post_id']}", json={**POST, "title": "Edited"}).json()
    assert edited["title"] == "Edited" and edited["updated_at"] >= post["updated_at"]
    assert edited["created_at"] == post["created_at"]
    assert gated.delete(f"/api/blog/{post['post_id']}").status_code == 204
    assert gated.get(f"/api/blog/{post['post_id']}").status_code == 404


def test_daily_post_cap(gated, monkeypatch):
    monkeypatch.setattr(blog_api, "BLOG_DAILY_POSTS", 2)
    _sign_in(gated, "google:3", "linus")
    assert [gated.post("/api/blog", json=POST).status_code for _ in range(3)] == [201, 201, 429]
