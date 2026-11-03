"""Send the www. form of the public host to the public URL (www.nimbotics.net -> https://nimbotics.net).

Sign-in cookies are set for one host, so the site keeps a single address. Every other host (the apex, the codespace
link, localhost) is served as before. Pure ASGI so progress streams (SSE) pass through untouched.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from starlette.responses import RedirectResponse
from starlette.types import ASGIApp, Receive, Scope, Send


def _host(scope: Scope) -> str:
    for name, value in scope.get("headers", []):
        if name == b"host":
            return value.decode("latin-1").split(":", 1)[0].lower()
    return ""


class WwwRedirect:
    def __init__(self, app: ASGIApp, public_url: str) -> None:
        parts = urlsplit(public_url)
        if not parts.scheme or not parts.hostname:
            raise ValueError(f"NIMBOTICS_PUBLIC_URL must be an absolute URL, got {public_url!r}")
        self.app = app
        self.origin = f"{parts.scheme}://{parts.netloc}"
        self.alias = f"www.{parts.hostname.lower()}"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or _host(scope) != self.alias:
            await self.app(scope, receive, send)
            return
        query = scope.get("query_string", b"").decode("latin-1")
        target = f"{self.origin}{scope['path']}" + (f"?{query}" if query else "")
        # 308 keeps the method and body, so a POST to the www address is not turned into a GET.
        await RedirectResponse(target, status_code=308)(scope, receive, send)
