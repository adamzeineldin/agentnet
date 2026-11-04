"""The blog: anyone reads; writing needs a signed-in user whenever sign-in is on (deps.require_user).

Only a post's author may edit or delete it. With sign-in off (local dev, tests) posts are written as "Guest".
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.deps import get_registry, require_user
from app.config import BLOG_DAILY_POSTS
from app.models.blog import BlogPost, BlogPostIn, BlogPostSummary, summarize
from app.models.user import User
from app.services.registry import Registry, utcnow

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/blog", tags=["blog"])

GUEST_ID = "guest"
GUEST_NAME = "Guest"
PAGE_MAX = 100


def _author(user: User | None) -> tuple[str, str, str | None]:
    return (user.user_id, user.name, user.avatar_url) if user else (GUEST_ID, GUEST_NAME, None)


def _require_post(registry: Registry, post_id: str) -> BlogPost:
    post = registry.get_post(post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No post '{post_id}'")
    return post


def _require_author(post: BlogPost, user: User | None) -> None:
    if post.author_id != _author(user)[0]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the author can change this post.")


@router.get("", response_model=list[BlogPostSummary])
def list_posts(limit: int = 50, offset: int = 0, author_id: str | None = None,
               registry: Registry = Depends(get_registry)) -> list[BlogPostSummary]:
    """Newest first, without the full text. author_id narrows to one writer."""
    posts = registry.list_posts(limit=min(max(limit, 1), PAGE_MAX), offset=max(offset, 0), author_id=author_id)
    return [summarize(p) for p in posts]


@router.get("/{post_id}", response_model=BlogPost)
def get_post(post_id: str, registry: Registry = Depends(get_registry)) -> BlogPost:
    return _require_post(registry, post_id)


@router.post("", response_model=BlogPost, status_code=201)
def create_post(body: BlogPostIn, user: User | None = Depends(require_user),
                registry: Registry = Depends(get_registry)) -> BlogPost:
    author_id, name, avatar = _author(user)
    now = utcnow()
    today = datetime.combine(now.date(), time.min, tzinfo=now.tzinfo)
    if BLOG_DAILY_POSTS and registry.count_posts_since(author_id, today) >= BLOG_DAILY_POSTS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"You've published {BLOG_DAILY_POSTS} posts today; try again tomorrow.")
    post = BlogPost(post_id=f"post_{now:%Y%m%d}_{secrets.token_hex(4)}", title=body.title, body=body.body,
                    author_id=author_id, author_name=name, author_avatar=avatar, created_at=now, updated_at=now)
    log.info("Blog post %s by %s", post.post_id, author_id)
    return registry.save_post(post)


@router.put("/{post_id}", response_model=BlogPost)
def update_post(post_id: str, body: BlogPostIn, user: User | None = Depends(require_user),
                registry: Registry = Depends(get_registry)) -> BlogPost:
    post = _require_post(registry, post_id)
    _require_author(post, user)
    return registry.save_post(post.model_copy(update={"title": body.title, "body": body.body, "updated_at": utcnow()}))


@router.delete("/{post_id}", status_code=204)
def delete_post(post_id: str, user: User | None = Depends(require_user),
                registry: Registry = Depends(get_registry)) -> Response:
    _require_author(_require_post(registry, post_id), user)
    registry.delete_post(post_id)
    log.info("Blog post %s deleted", post_id)
    return Response(status_code=204)
