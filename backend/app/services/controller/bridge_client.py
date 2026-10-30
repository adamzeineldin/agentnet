"""HTTP client for ur_bridge. The transport is injectable so tests never touch a network."""

from __future__ import annotations

import httpx

STATUS_TIMEOUT_S = 3.0
EXECUTE_TIMEOUT_S = 120.0


class BridgeError(Exception):
    """The bridge or the controller behind it could not be used."""


class BridgeClient:
    def __init__(self, base_url: str, transport: httpx.BaseTransport | None = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._transport = transport

    def _request(self, method: str, path: str, timeout: float, payload: dict | None = None) -> dict:
        try:
            with httpx.Client(base_url=self._base_url, transport=self._transport, timeout=timeout) as http:
                res = http.request(method, path, json=payload)
        except httpx.HTTPError as exc:
            raise BridgeError(f"ur_bridge unreachable: {type(exc).__name__}: {exc}") from exc
        try:
            body = res.json()
        except ValueError as exc:
            raise BridgeError(f"ur_bridge returned non-JSON (HTTP {res.status_code})") from exc
        if res.status_code != 200:
            raise BridgeError(f"ur_bridge HTTP {res.status_code}: {body.get('error', body)}")
        return body

    def status(self) -> dict:
        return self._request("GET", "/status", STATUS_TIMEOUT_S)

    def execute(self, samples: list[list[float]], dt: float) -> dict:
        return self._request("POST", "/execute", EXECUTE_TIMEOUT_S, {"samples": samples, "dt": dt})
