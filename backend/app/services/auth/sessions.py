"""HMAC-signed, expiring tokens for the session and OAuth-state cookies (stdlib only).

A token is base64url(JSON payload) + "." + base64url(HMAC-SHA256). Payloads carry
an absolute expiry; anything unsigned, tampered with or expired reads as None.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign(payload: dict, secret: str, ttl_s: int, now: float | None = None) -> str:
    body = _b64(json.dumps({**payload, "exp": int((now or time.time()) + ttl_s)},
                           separators=(",", ":")).encode())
    mac = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64(mac)}"


def verify(token: str | None, secret: str, now: float | None = None) -> dict | None:
    if not token or token.count(".") != 1:
        return None
    body, mac = token.split(".")
    expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    try:
        if not hmac.compare_digest(_unb64(mac), expected):
            return None
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or payload.get("exp", 0) < (now or time.time()):
        return None
    return payload


def safe_next(path: str | None) -> str:
    """Only same-site relative paths survive; anything else becomes '/' (no open redirects)."""
    if not path or not path.startswith("/") or path.startswith("//") or "\\" in path or "\n" in path:
        return "/"
    return path
