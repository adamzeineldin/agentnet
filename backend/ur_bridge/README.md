# ur_bridge: URSim controller execution

This step is optional. After a transfer is verified in MuJoCo, the UR5e's solved joint path can also be streamed to
**URSim**. URSim is Universal Robots' controller software (PolyScope 5, e-Series) running in Docker. Nimbotics
then records what the controller reports back.

**What this is not:** it is not a physical arm. URSim runs the real controller software on an idealized arm: no
payload and no real dynamics. It also does not know about the obstacle, which exists only in the MuJoCo scene.
Results are labelled "URSim controller, not physical". The same bridge talks to a physical UR e-Series arm if
`UR_HOST` points at it. That has not been tried.

## How it works

```
Nimbotics backend ──HTTP──▶ ur_bridge (Linux container, ur_rtde 1.6.5) ──RTDE──▶ URSim 5.26 (UR5e)
```

1. **Retime.** The backend retimes the verified joint path with the same speed rule MuJoCo executed it with
   (1 rad/s, 125 Hz samples).
2. **Stream.** The bridge does `moveJ` to the first sample, then sends `servoJ` for every sample, paced by its own
   clock. It holds the last sample until the controller reports it, then reads back joints, TCP pose, safety mode
   and protective stops.
3. **Compare.** The backend compares the result:
   - final joints against the command;
   - controller TCP against MuJoCo forward kinematics at the same joints;
   - controller TCP against the task target.

   The controller's base frame is the Menagerie base body rotated 180° about z. This is declared in
   `robot_catalog.py` and was measured on 2026-10-29.
4. **Store.** The result is stored as `results.controller_execution` on the transfer run. It never changes the
   simulation result, and a failed controller run is recorded as failed.

`ur_rtde` has no macOS wheels, which is why the bridge runs in a container. On Apple Silicon both containers run
under amd64 emulation. URSim boots in about 30 s and uses about 1.5 GB of RAM.

## Run it

```bash
make ursim-up                     # URSim + bridge; pendant at http://localhost:6080/vnc.html
```

Do the one-time setup in the pendant. A physical e-Series arm needs the same steps:

1. Power on and release the brakes. You can also do this from the dashboard on port 29999:
   `power on`, then `brake release`.
2. Confirm the default safety configuration when prompted.
3. Go to ☰ → Settings → System → Remote Control → **Enable** → Exit. Then switch the top-right selector to
   **Remote**.

Then add the bridge URL to `.env` and restart the backend:

```bash
NIMBOTICS_URSIM_BRIDGE_URL=http://127.0.0.1:8765
```

In the Transfer Lab, tick **also run on the URSim controller (not physical)** before **Transfer Skill**. The option
is enabled only when `GET /api/controller/status` reports the controller reachable, in remote control, and in
NORMAL safety mode.

## Tests

`backend/tests/test_ur_bridge.py` and `backend/tests/test_controller.py` use a fake controller behind
`httpx.MockTransport`. They need no URSim, no ur_rtde and no network.
