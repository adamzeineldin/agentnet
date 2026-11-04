"""Blog posts written by signed-in users. Text only: the page renders it as plain paragraphs, never as HTML."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

TITLE_MAX = 120
BODY_MAX = 20_000
EXCERPT_CHARS = 240

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TITLE_MAX)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=BODY_MAX)]


class BlogPostIn(BaseModel):
    """What a writer sends: a title and the text."""

    model_config = ConfigDict(frozen=True, extra="forbid")
    title: Title
    body: Body


class BlogPost(BaseModel):
    model_config = ConfigDict(frozen=True)
    post_id: str
    title: str
    body: str
    # "<provider>:<id>" of the writer, or "guest" when sign-in is off on this server.
    author_id: str
    author_name: str
    author_avatar: str | None = None
    created_at: datetime
    updated_at: datetime


class BlogPostSummary(BaseModel):
    """A post in the list: everything but the full text."""

    model_config = ConfigDict(frozen=True)
    post_id: str
    title: str
    excerpt: str
    author_id: str
    author_name: str
    author_avatar: str | None = None
    created_at: datetime
    updated_at: datetime


def summarize(post: BlogPost) -> BlogPostSummary:
    text = " ".join(post.body.split())
    excerpt = text if len(text) <= EXCERPT_CHARS else text[:EXCERPT_CHARS].rsplit(" ", 1)[0] + "…"
    return BlogPostSummary(**post.model_dump(exclude={"body"}), excerpt=excerpt)
