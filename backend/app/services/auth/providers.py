"""Google and GitHub OAuth 2.0 authorization-code flows.

Each provider turns a callback code into a stable user id plus display fields.
Access tokens are used once to read the profile and never stored.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.config import GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
from app.models.user import Provider

TIMEOUT_S = 10.0


class OAuthError(RuntimeError):
    """The provider refused the code or returned an unusable profile."""


@dataclass(frozen=True)
class Profile:
    provider: Provider
    provider_user_id: str
    name: str
    email: str | None
    avatar_url: str | None


@dataclass(frozen=True)
class ProviderConfig:
    provider: Provider
    client_id: str
    client_secret: str
    authorize_url: str
    token_url: str
    scope: str


def configured() -> dict[Provider, ProviderConfig]:
    found: dict[Provider, ProviderConfig] = {}
    if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
        found["google"] = ProviderConfig(
            "google", GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
            "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token",
            "openid email profile",
        )
    if GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET:
        found["github"] = ProviderConfig(
            "github", GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
            "https://github.com/login/oauth/authorize", "https://github.com/login/oauth/access_token",
            "read:user",
        )
    return found


def authorize_url(cfg: ProviderConfig, redirect_uri: str, state: str) -> str:
    params = {"client_id": cfg.client_id, "redirect_uri": redirect_uri, "scope": cfg.scope,
              "state": state, "response_type": "code"}
    if cfg.provider == "google":
        params["prompt"] = "select_account"
    return f"{cfg.authorize_url}?{urlencode(params)}"


def _exchange(client: httpx.Client, cfg: ProviderConfig, code: str, redirect_uri: str) -> str:
    res = client.post(cfg.token_url, headers={"Accept": "application/json"}, data={
        "client_id": cfg.client_id, "client_secret": cfg.client_secret, "code": code,
        "redirect_uri": redirect_uri, "grant_type": "authorization_code",
    })
    body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
    token = body.get("access_token")
    if res.status_code != 200 or not token:
        raise OAuthError(f"{cfg.provider} token exchange failed: {body.get('error', res.status_code)}")
    return token


def _google_profile(client: httpx.Client, token: str) -> Profile:
    res = client.get("https://openidconnect.googleapis.com/v1/userinfo",
                     headers={"Authorization": f"Bearer {token}"})
    data = res.json()
    if res.status_code != 200 or not data.get("sub"):
        raise OAuthError("Google did not return a user id")
    return Profile("google", str(data["sub"]), data.get("given_name") or data.get("name") or "Google user",
                   data.get("email") if data.get("email_verified") else None, data.get("picture"))


def _github_profile(client: httpx.Client, token: str) -> Profile:
    res = client.get("https://api.github.com/user", headers={
        "Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
    data = res.json()
    if res.status_code != 200 or not data.get("id"):
        raise OAuthError("GitHub did not return a user id")
    return Profile("github", str(data["id"]), data.get("login") or "GitHub user", None, data.get("avatar_url"))


def fetch_profile(cfg: ProviderConfig, code: str, redirect_uri: str) -> Profile:
    with httpx.Client(timeout=TIMEOUT_S) as client:
        token = _exchange(client, cfg, code, redirect_uri)
        return _google_profile(client, token) if cfg.provider == "google" else _github_profile(client, token)
