"""Signed-in users. Only what a provider returns for display is stored; no tokens are kept."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

Provider = Literal["google", "github"]


class User(BaseModel):
    model_config = ConfigDict(frozen=True)
    user_id: str  # "<provider>:<provider's stable user id>"
    provider: Provider
    name: str
    email: str | None = None
    avatar_url: str | None = None
    created_at: datetime
    last_login_at: datetime


class PublicUser(BaseModel):
    """What the browser sees about the signed-in user."""

    model_config = ConfigDict(frozen=True)
    user_id: str
    provider: Provider
    name: str
    avatar_url: str | None = None


class AuthConfig(BaseModel):
    model_config = ConfigDict(frozen=True)
    providers: list[Provider]
    # True when starting runs needs a signed-in user (any provider configured).
    required: bool
