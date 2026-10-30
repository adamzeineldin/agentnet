"""Serve the statically exported frontend (frontend/ NEXT_OUTPUT=export) from the API process.

Used by the single-container cloud image so the site and the API share one origin and one port. Registered after
every API router and mount, so /api/* and /artifacts/* always win.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

RESERVED_PREFIXES = ("api/", "artifacts/")


def _resolve(root: Path, path: str) -> Path | None:
    """The exported file for a URL path: exact file, then `<path>.html`, then `<path>/index.html`."""
    for candidate in (path, f"{path}.html", f"{path}/index.html"):
        target = (root / candidate).resolve()
        if target.is_file() and target.is_relative_to(root):
            return target
    return None


def mount_web(app: FastAPI, web_dir: Path) -> None:
    root = web_dir.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def web(path: str) -> FileResponse:
        if path.startswith(RESERVED_PREFIXES):
            raise HTTPException(404, "Not Found")
        found = _resolve(root, path.strip("/") or "index.html")
        if found is not None:
            return FileResponse(found)
        missing = root / "404.html"
        if missing.is_file():
            return FileResponse(missing, status_code=404)
        raise HTTPException(404, "Not Found")
