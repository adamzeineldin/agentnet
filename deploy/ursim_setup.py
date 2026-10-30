"""Bring URSim to a state where ur_rtde may control it, without a person at the pendant.

1. Wait for the dashboard server (port 29999).
2. Confirm the default safety configuration (first boot shows a dialog) by clicking its button.
3. Power on and release the brakes (dashboard commands).
4. Switch the pendant from Local to Remote control by clicking the top-right selector, retrying until the
   dashboard reports remote control. "Remote Control enabled" itself is pre-set in remotecontrol.properties.

Clicks use xdotool on URSim's virtual display (:1, 1280x800). Every step is logged; the result is written to
/tmp/ursim_setup.json. The API's /api/controller/status reports readiness independently.
"""

from __future__ import annotations

import json
import socket
import subprocess
import time

DASHBOARD = ("127.0.0.1", 29999)
# Pixel positions on URSim 5.26's 1280x800 pendant.
CONFIRM_SAFETY = (638, 706)
LOCAL_REMOTE_SELECTOR = (1115, 35)
REMOTE_OPTION = (1053, 88)
STATUS_FILE = "/tmp/ursim_setup.json"
CONTROLLER_UP = ("POWER_OFF", "IDLE", "RUNNING")


def dashboard(command: str, timeout: float = 5.0) -> str:
    with socket.create_connection(DASHBOARD, timeout=timeout) as s:
        s.recv(1024)  # greeting
        s.sendall((command + "\n").encode())
        return s.recv(1024).decode().strip()


def wait_for(predicate, timeout_s: float, every_s: float = 2.0) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            if predicate():
                return True
        except OSError:
            pass
        time.sleep(every_s)
    return False


def click(xy: tuple[int, int]) -> None:
    subprocess.run(["xdotool", "mousemove", str(xy[0]), str(xy[1]), "click", "1"], check=False)


def main() -> None:
    log: list[str] = []

    def step(msg: str) -> None:
        log.append(f"{time.strftime('%H:%M:%S')} {msg}")
        print(log[-1], flush=True)

    ok = wait_for(lambda: "Robotmode" in dashboard("robotmode"), 300)
    step(f"dashboard reachable: {ok}")
    if ok:
        time.sleep(15)  # let PolyScope finish drawing before clicking
        click(CONFIRM_SAFETY)
        step("clicked 'Confirm Safety Configuration' (no-op if already confirmed)")
        # Confirming restarts URControl; wait until the controller reports a power state again.
        ready = wait_for(lambda: any(m in dashboard("robotmode") for m in CONTROLLER_UP), 180, every_s=3)
        step(f"controller up after confirmation: {ready} ({dashboard('robotmode')})")
        for command, goal in (("power on", ("IDLE", "RUNNING")), ("brake release", ("RUNNING",))):
            for attempt in range(1, 4):
                step(f"{command} (attempt {attempt}) → {dashboard(command)}")
                if wait_for(lambda g=goal: any(m in dashboard("robotmode") for m in g), 60):
                    break
        step(dashboard("robotmode"))
        for attempt in range(1, 6):
            if dashboard("is in remote control").strip().lower() == "true":
                break
            click(LOCAL_REMOTE_SELECTOR)
            time.sleep(1.5)
            click(REMOTE_OPTION)
            time.sleep(2.5)
            step(f"remote control attempt {attempt}")
        remote = dashboard("is in remote control").strip().lower() == "true"
        step(f"remote control: {remote}; safety: {dashboard('safetystatus')}")
        ok = remote
    with open(STATUS_FILE, "w") as f:
        json.dump({"ready": ok, "log": log}, f, indent=1)


if __name__ == "__main__":
    main()
