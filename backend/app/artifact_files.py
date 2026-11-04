"""/artifacts: run videos, clips and robot snapshots, from this machine's disk or else the file store.

Files of a private run (runs/<run_id>/...) or a private robot (snapshots/<robot_id>.png) are served only to their
owner, are marked `Cache-Control: private` so a shared cache (Cloudflare) never keeps them, and leave the bucket only
through signed links (models/sharing.py).
"""

from __future__ import annotations

import logging
from pathlib import PurePosixPath

import anyio
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from app.api.deps import SESSION_COOKIE, user_from_cookie
from app.models.sharing import can_see
from app.services import storage
from app.services.registry import Registry

log = logging.getLogger(__name__)
PRIVATE_CACHE = "private, no-store"


def _owner_and_visibility(registry: Registry, parts: tuple[str, ...]) -> tuple[str | None, str]:
    """Who may see the file at parts: a run folder or a robot snapshot follows that item; the rest is public."""
    if len(parts) >= 2 and parts[0] == "runs":
        run = registry.get_run(parts[1])
        return (run.owner_id, run.visibility) if run else (None, "public")
    if len(parts) == 2 and parts[0] == "snapshots":
        return registry.robot_access().get(PurePosixPath(parts[1]).stem, (None, "public"))
    return None, "public"


class ArtifactFiles(StaticFiles):
    """StaticFiles over ARTIFACT_DIR with owner checks; a file this disk lacks redirects to its file store copy."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        relative = PurePosixPath(path.replace("\\", "/"))
        if relative.is_absolute() or ".." in relative.parts:
            raise HTTPException(status_code=404)
        private = await anyio.to_thread.run_sync(self._private_to_viewer, relative.parts, scope)
        response = await self._from_disk_or_store(path, relative, scope, private)
        if private:
            response.headers["Cache-Control"] = PRIVATE_CACHE
        return response

    @staticmethod
    def _private_to_viewer(parts: tuple[str, ...], scope: Scope) -> bool:
        """True for a private file the viewer owns; 404 for one they may not see (same as a missing file)."""
        registry: Registry = scope["app"].state.registry
        owner, visibility = _owner_and_visibility(registry, parts)
        if visibility == "public":
            return False
        user = user_from_cookie(Request(scope).cookies.get(SESSION_COOKIE), registry)
        if not can_see(owner, visibility, user.user_id if user else None):
            raise HTTPException(status_code=404)
        return True

    async def _from_disk_or_store(self, path: str, relative: PurePosixPath, scope: Scope, private: bool) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or storage.get_store() is None or relative.as_posix() in ("", "."):
                raise
        try:
            url = storage.artifact_url(relative.as_posix(), private=private)
        except storage.StoreError:
            log.exception("Could not link artifacts/%s in the file store", relative)
            raise HTTPException(status_code=503) from None
        return RedirectResponse(url, status_code=307)
