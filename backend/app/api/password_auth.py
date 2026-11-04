"""Email + password accounts: create one, or sign in to one. Both start the same session cookie as Google sign-in.

On whenever the server can sign session cookies (deps.password_enabled). Every failed sign-in gets the same answer,
so the endpoint never tells whether an email has an account; repeated failures lock that email for a while, and
sign-ups are capped per address.
"""

from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.api.auth import public, start_session
from app.api.deps import get_registry, password_enabled
from app.models.user import Credential, PasswordSignIn, PublicUser, RegisterRequest, User
from app.services.auth.passwords import (
    AttemptLimiter, burn_time, hash_password, normalize_email, valid_email, verify_password,
)
from app.services.registry import Registry, utcnow

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

WRONG = "Wrong email or password."
FAILURES = AttemptLimiter(limit=8, window_s=15 * 60)  # failed sign-ins per email
SIGNUPS = AttemptLimiter(limit=10, window_s=60 * 60)  # new accounts per client address


def _require_enabled() -> None:
    if not password_enabled():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Email accounts are not switched on for this server.")


def _client(request: Request) -> str:
    """The visitor's address; behind Cloudflare every request comes from the tunnel, so its header wins."""
    forwarded = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "").split(",")[0]
    return forwarded.strip() or (request.client.host if request.client else "unknown")


@router.post("/register", response_model=PublicUser, status_code=201)
def register(body: RegisterRequest, request: Request, response: Response,
             registry: Registry = Depends(get_registry)) -> PublicUser:
    _require_enabled()
    email = normalize_email(body.email)
    if not valid_email(email):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Enter a valid email address.")
    client = _client(request)
    if not SIGNUPS.allowed(client):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many new accounts from here; try again later.")
    now = utcnow()
    user = User(user_id=f"email:{secrets.token_hex(8)}", provider="email", name=body.name, email=email,
                avatar_url=None, created_at=now, last_login_at=now)
    if not registry.add_credential(Credential(email=email, user_id=user.user_id,
                                              password_hash=hash_password(body.password), created_at=now)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists. Sign in instead.")
    SIGNUPS.hit(client)
    registry.save_user(user)
    log.info("Registered %s", user.user_id)
    start_session(response, request, user)
    return public(user)


@router.post("/signin", response_model=PublicUser)
def sign_in(body: PasswordSignIn, request: Request, response: Response,
            registry: Registry = Depends(get_registry)) -> PublicUser:
    _require_enabled()
    email = normalize_email(body.email)
    if not FAILURES.allowed(email):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Too many wrong passwords for this email; wait 15 minutes and try again.")
    credential = registry.get_credential(email)
    if credential is None:
        burn_time(body.password)
    user = registry.get_user(credential.user_id) if credential and verify_password(body.password, credential.password_hash) else None
    if user is None:
        FAILURES.hit(email)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, WRONG)
    user = registry.save_user(user.model_copy(update={"last_login_at": utcnow()}))
    log.info("Signed in %s with a password", user.user_id)
    start_session(response, request, user)
    return public(user)
