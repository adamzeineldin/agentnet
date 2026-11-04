"""Email + password accounts: scrypt hashes (stdlib), email normalisation and an in-memory attempt limiter.

A stored hash is "scrypt$<n>$<r>$<p>$<salt b64>$<key b64>"; the parameters travel with it, so they can be raised
later without breaking existing accounts. Plain passwords are never stored or logged.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import threading
import time
from collections import deque

SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
KEY_BYTES = 32
SALT_BYTES = 16
MAXMEM = 64 * 1024 * 1024

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
EMAIL_MAX = 254


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode()


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=KEY_BYTES, maxmem=MAXMEM)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    key = _scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(key)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, key = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.urlsafe_b64decode(key)
        actual = _scrypt(password, base64.urlsafe_b64decode(salt), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Hashed once so a sign-in for an unknown email costs the same time as a real one (no account probing by timing).
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def burn_time(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def valid_email(email: str) -> bool:
    return len(email) <= EMAIL_MAX and EMAIL_RE.match(email) is not None


class AttemptLimiter:
    """At most `limit` hits per key within `window_s` seconds. Per process; resets when the server restarts."""

    def __init__(self, limit: int, window_s: float) -> None:
        self.limit = limit
        self.window_s = window_s
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> deque[float]:
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= now - self.window_s:
            hits.popleft()
        return hits

    def allowed(self, key: str, now: float | None = None) -> bool:
        with self._lock:
            return len(self._recent(key, time.monotonic() if now is None else now)) < self.limit

    def hit(self, key: str, now: float | None = None) -> None:
        at = time.monotonic() if now is None else now
        with self._lock:
            self._recent(key, at).append(at)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()
