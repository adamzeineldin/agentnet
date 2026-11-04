"""Private workspaces: who owns a run, skill or uploaded robot, and who may see it.

New work by a signed-in user starts private (only its owner sees it); the owner makes it public to share it in the
Library. Work with no owner (sign-in off, or saved before accounts) is public and stays public.
The owner's user id is never sent to pages; responses say only whether the viewer owns an item (`mine`).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Visibility = Literal["private", "public"]
ItemKind = Literal["run", "skill", "robot"]


def initial_visibility(owner_id: str | None) -> Visibility:
    return "private" if owner_id else "public"


def can_see(owner_id: str | None, visibility: str, viewer_id: str | None) -> bool:
    return visibility == "public" or (owner_id is not None and owner_id == viewer_id)


class SharedItem(BaseModel):
    model_config = ConfigDict(frozen=True)
    kind: ItemKind
    id: str
    label: str


class VisibilityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: ItemKind
    id: str = Field(min_length=1, max_length=96)
    visibility: Visibility
    # The change also applies to `also` (see VisibilityPlan); without confirm a plan with `also` is answered 409.
    confirm: bool = False


class VisibilityPlan(BaseModel):
    """What a visibility change does: the item itself plus everything that must change with it."""

    model_config = ConfigDict(frozen=True)
    item: SharedItem
    visibility: Visibility
    also: list[SharedItem] = Field(default_factory=list)
    applied: bool = False
