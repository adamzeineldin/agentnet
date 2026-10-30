"""Minimal HTTP bridge between the AgentNet backend and a UR controller (URSim or a physical arm).

Runs where ur_rtde has wheels (the Linux container in this folder). One execution at a time; the control
script is released after every request. Endpoints:
  GET  /status   controller version, model, remote-control flag, robot and safety mode
  POST /execute  {"samples": [[6 floats], ...], "dt": s}  → executor.execute() result
"""

from __future__ import annotations

import json
import logging
import os
import threading
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from ur_bridge.executor import execute, parse_request, status

log = logging.getLogger("ur_bridge")
Factory = Callable[[], Any]


class BridgeApp:
    def __init__(self, open_control: Factory, open_receive: Factory, open_dashboard: Factory) -> None:
        self._open_control = open_control
        self._open_receive = open_receive
        self._open_dashboard = open_dashboard
        self._busy = threading.Lock()

    def handle(self, method: str, path: str, body: bytes) -> tuple[int, dict]:
        if method == "GET" and path == "/status":
            return self._status()
        if method == "POST" and path == "/execute":
            return self._execute(body)
        return 404, {"error": f"no route {method} {path}"}

    def _status(self) -> tuple[int, dict]:
        try:
            return 200, status(self._open_receive(), self._open_dashboard())
        except Exception as exc:  # noqa: BLE001 - reported to the caller
            log.warning("status failed: %s", exc)
            return 502, {"error": f"controller not reachable: {exc}"}

    def _execute(self, body: bytes) -> tuple[int, dict]:
        try:
            req = parse_request(json.loads(body or b"null"))
        except (ValueError, TypeError) as exc:
            return 400, {"error": str(exc)}
        if not self._busy.acquire(blocking=False):
            return 409, {"error": "another execution is in progress"}
        try:
            rec = self._open_receive()
            ctl = self._open_control()
        except Exception as exc:  # noqa: BLE001
            self._busy.release()
            log.warning("controller connection failed: %s", exc)
            return 502, {"error": f"controller connection failed: {exc}"}
        try:
            return 200, execute(ctl, rec, req)
        except Exception as exc:  # noqa: BLE001
            log.exception("execution crashed")
            return 502, {"error": f"execution crashed: {type(exc).__name__}: {exc}"}
        finally:
            try:
                ctl.stopScript()
            finally:
                self._busy.release()


def _handler(app: BridgeApp) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def _respond(self, method: str) -> None:
            length = int(self.headers.get("Content-Length") or 0)
            code, payload = app.handle(method, self.path, self.rfile.read(length) if length else b"")
            data = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:  # noqa: N802
            self._respond("GET")

        def do_POST(self) -> None:  # noqa: N802
            self._respond("POST")

    return Handler


def main() -> None:  # pragma: no cover - needs ur_rtde and a controller
    import dashboard_client
    import rtde_control
    import rtde_receive

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    host = os.environ.get("UR_HOST", "ursim")

    def open_dashboard():
        dash = dashboard_client.DashboardClient(host)
        dash.connect()
        return dash

    app = BridgeApp(
        open_control=lambda: rtde_control.RTDEControlInterface(host),
        open_receive=lambda: rtde_receive.RTDEReceiveInterface(host),
        open_dashboard=open_dashboard,
    )
    port = int(os.environ.get("BRIDGE_PORT", "8765"))
    log.info("ur_bridge on :%d → controller %s", port, host)
    ThreadingHTTPServer(("0.0.0.0", port), _handler(app)).serve_forever()


if __name__ == "__main__":  # pragma: no cover
    main()
