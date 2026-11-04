"""Sign-in with Google or GitHub (OAuth 2.0 authorization code), and the session cookie.

Browsing never needs an account. When a provider is configured, starting runs and changing
shared data needs a signed-in user (deps.require_user). Tokens from providers are not stored.
"""

from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse, Response

from app.api.deps import SESSION_COOKIE, auth_required, current_user, get_registry, password_enabled
from app.config import APP_URL, PUBLIC_URL, SESSION_DAYS, SESSION_SECRET
from app.models.user import AuthConfig, Provider, PublicUser, User
from app.services.auth import providers
from app.services.auth.sessions import safe_next, sign, verify
from app.services.registry import Registry, utcnow

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

STATE_COOKIE = "nimbotics_oauth_state"
STATE_TTL_S = 600


def _origin(request: Request) -> str:
    return PUBLIC_URL or str(request.base_url).rstrip("/")


def _app_origin(request: Request) -> str:
    """Where the pages live; the OAuth callback itself always comes back to the API (_origin)."""
    return APP_URL or _origin(request)


def _redirect_uri(request: Request, provider: str) -> str:
    return f"{_origin(request)}/api/auth/callback/{provider}"


def _secure(request: Request) -> bool:
    return _origin(request).startswith("https://")


def _provider(provider: str) -> providers.ProviderConfig:
    cfg = providers.configured().get(provider)  # type: ignore[call-overload]
    if cfg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Sign-in with '{provider}' is not configured on this server")
    if not SESSION_SECRET:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "NIMBOTICS_SESSION_SECRET is not set")
    return cfg


def public(user: User) -> PublicUser:
    return PublicUser(user_id=user.user_id, provider=user.provider, name=user.name, avatar_url=user.avatar_url)


def start_session(res: Response, request: Request, user: User) -> None:
    """Set the signed session cookie that keeps `user` signed in."""
    res.set_cookie(SESSION_COOKIE, sign({"uid": user.user_id}, SESSION_SECRET, SESSION_DAYS * 86400),
                   max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax", secure=_secure(request), path="/")


@router.get("/config", response_model=AuthConfig)
def config() -> AuthConfig:
    return AuthConfig(providers=sorted(providers.configured()), password=password_enabled(), required=auth_required())


@router.get("/me", response_model=PublicUser | None)
def me(user: User | None = Depends(current_user)) -> PublicUser | None:
    return public(user) if user else None


@router.get("/login/{provider}")
def login(provider: Provider, request: Request, next: str = "/") -> RedirectResponse:
    cfg = _provider(provider)
    state = secrets.token_urlsafe(24)
    res = RedirectResponse(providers.authorize_url(cfg, _redirect_uri(request, provider), state), status.HTTP_302_FOUND)
    token = sign({"state": state, "provider": provider, "next": safe_next(next)}, SESSION_SECRET, STATE_TTL_S)
    res.set_cookie(STATE_COOKIE, token, max_age=STATE_TTL_S, httponly=True, samesite="lax",
                   secure=_secure(request), path="/api/auth")
    return res


@router.get("/callback/{provider}")
def callback(
    provider: Provider, request: Request, code: str | None = None, state: str | None = None,
    error: str | None = None, registry: Registry = Depends(get_registry),
) -> RedirectResponse:
    cfg = _provider(provider)
    saved = verify(request.cookies.get(STATE_COOKIE), SESSION_SECRET)
    if not saved or saved.get("provider") != provider or not state \
            or not secrets.compare_digest(str(saved.get("state")), state):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sign-in expired or was started elsewhere; try again.")
    next_path = safe_next(saved.get("next"))
    if error or not code:
        return RedirectResponse(f"{_app_origin(request)}{next_path}", status.HTTP_302_FOUND)
    try:
        profile = providers.fetch_profile(cfg, code, _redirect_uri(request, provider))
    except (providers.OAuthError, ValueError) as exc:
        log.warning("Sign-in with %s failed: %s", provider, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Sign-in with {provider} failed; try again.") from exc
    user_id = f"{profile.provider}:{profile.provider_user_id}"
    existing = registry.get_user(user_id)
    now = utcnow()
    user = registry.save_user(User(
        user_id=user_id, provider=profile.provider, name=profile.name, email=profile.email,
        avatar_url=profile.avatar_url, created_at=existing.created_at if existing else now, last_login_at=now,
    ))
    log.info("Signed in %s", user.user_id)
    res = RedirectResponse(f"{_app_origin(request)}{next_path}", status.HTTP_302_FOUND)
    res.delete_cookie(STATE_COOKIE, path="/api/auth")
    start_session(res, request, user)
    return res


@router.post("/logout", status_code=204)
def logout() -> Response:
    res = Response(status_code=204)
    res.delete_cookie(SESSION_COOKIE, path="/")
    return res
