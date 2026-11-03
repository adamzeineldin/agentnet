"""Recent rendered frames of each running run, for the live view.

Frames come from the same MuJoCo renders that make the run's clips (nothing
extra is simulated). The worker thread publishes; API requests read. A short
buffer per run (with publish times) lets the browser play frames back evenly;
it is dropped when the run finishes.
"""

from __future__ import annotations

import io
import threading
import time
from collections import deque
from dataclasses import dataclass

import numpy as np
from PIL import Image

from app.config import LIVE_FRAME_INTERVAL_S
from app.services.render import FrameSink

JPEG_QUALITY = 68
BUFFER_FRAMES = 45  # 3 s at 15 fps


@dataclass(frozen=True)
class LiveFrame:
    seq: int
    label: str
    jpeg: bytes
    # Seconds since the run's first live frame, so playback keeps the spacing frames were rendered with.
    t: float


class LiveFrames:
    def __init__(self, min_interval_s: float = LIVE_FRAME_INTERVAL_S) -> None:
        self._min_interval = min_interval_s
        self._frames: dict[str, deque[LiveFrame]] = {}
        self._last_publish: dict[str, float] = {}
        self._start: dict[str, float] = {}
        self._lock = threading.Lock()

    def publish(self, run_id: str, frame: np.ndarray, label: str) -> None:
        now = time.monotonic()
        with self._lock:
            frames = self._frames.get(run_id)
            current = frames[-1] if frames else None
            # A new label (a new try, the final recording) always shows at once; within one, frames are throttled.
            same_label = current is not None and current.label == label
            if same_label and now - self._last_publish.get(run_id, -np.inf) < self._min_interval:
                return
            self._last_publish[run_id] = now
            start = self._start.setdefault(run_id, now)
            seq = current.seq + 1 if current is not None else 1
        buf = io.BytesIO()
        Image.fromarray(frame).save(buf, "JPEG", quality=JPEG_QUALITY)
        with self._lock:
            self._frames.setdefault(run_id, deque(maxlen=BUFFER_FRAMES)).append(
                LiveFrame(seq, label, buf.getvalue(), now - start))

    def sink(self, run_id: str, label: str) -> FrameSink:
        """A FrameRecorder `on_frame` callback that publishes under `label`."""
        return lambda frame: self.publish(run_id, frame, label)

    def get(self, run_id: str) -> LiveFrame | None:
        """Newest frame."""
        with self._lock:
            frames = self._frames.get(run_id)
            return frames[-1] if frames else None

    def since(self, run_id: str, after: int) -> list[LiveFrame]:
        """Buffered frames newer than seq `after`, oldest first."""
        with self._lock:
            return [f for f in self._frames.get(run_id, ()) if f.seq > after]

    def clear(self, run_id: str) -> None:
        with self._lock:
            self._frames.pop(run_id, None)
            self._last_publish.pop(run_id, None)
            self._start.pop(run_id, None)


LIVE = LiveFrames()
