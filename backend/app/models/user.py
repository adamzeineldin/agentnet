"""Signed-in users. Only what a provider returns for display is stored; no tokens are kept."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

# OAuth providers (login routes take one of these); an account is one of them or an email + password account.
Provider = Literal["google", "github"]
Account = Literal["google", "github", "email"]

PASSWORD_MIN = 8
PASSWORD_MAX = 128
NAME_MAX = 60


class User(BaseModel):
    model_config = ConfigDict(frozen=True)
    user_id: str  # "<provider>:<provider's stable user id>", or "email:<random id>" for an email account
    provider: Account
    name: str
    email: str | None = None
    avatar_url: str | None = None
    created_at: datetime
    last_login_at: datetime


class PublicUser(BaseModel):
    """What the browser sees about the signed-in user."""

    model_config = ConfigDict(frozen=True)
    user_id: str
    provider: Account
    name: str
    avatar_url: str | None = None


class AuthConfig(BaseModel):
    model_config = ConfigDict(frozen=True)
    providers: list[Provider]
    # Email + password accounts: on whenever the server can sign session cookies.
    password: bool
    # True when starting runs needs a signed-in user (a provider configured, or email accounts on).
    required: bool


Password = Annotated[str, StringConstraints(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)]


class RegisterRequest(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=NAME_MAX)]
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
    password: Password


class PasswordSignIn(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=254)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=PASSWORD_MAX)]


class Credential(BaseModel):
    """An email account's sign-in secret. Never sent to the browser."""

    model_config = ConfigDict(frozen=True)
    email: str  # normalised (trimmed, lower case)
    user_id: str
    password_hash: str
    created_at: datetime
