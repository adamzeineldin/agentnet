"""Offscreen rendering of real MuJoCo states to PNG frames and MP4 clips.

A Renderer owns an OpenGL context, so create and use it on one thread (the
simulation worker) and close it when done.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import imageio.v3 as iio
import mujoco
import numpy as np
from PIL import Image

from app.config import RENDER_HEIGHT, RENDER_WIDTH, VIDEO_FPS


@dataclass(frozen=True)
class CameraView:
    lookat: tuple[float, float, float] = (0.3, 0.0, 0.35)
    distance: float = 1.9
    azimuth: float = 145.0
    elevation: float = -22.0


DEFAULT_VIEW = CameraView()


class FrameRecorder:
    def __init__(
        self,
        model: mujoco.MjModel,
        view: CameraView = DEFAULT_VIEW,
        width: int = RENDER_WIDTH,
        height: int = RENDER_HEIGHT,
    ) -> None:
        self.model = model
        self.renderer = mujoco.Renderer(model, height, width)
        self.camera = mujoco.MjvCamera()
        self.camera.lookat[:] = view.lookat
        self.camera.distance = view.distance
        self.camera.azimuth = view.azimuth
        self.camera.elevation = view.elevation
        self.option = mujoco.MjvOption()
        self.option.sitegroup[:] = [1, 1, 1, 0, 0, 0]
        self.frames: list[np.ndarray] = []

    def capture(self, data: mujoco.MjData) -> np.ndarray:
        self.renderer.update_scene(data, self.camera, self.option)
        frame = self.renderer.render().copy()
        self.frames.append(frame)
        return frame

    def save_png(self, frame: np.ndarray, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(frame).save(path)
        return path

    def save_mp4(self, path: Path, fps: int = VIDEO_FPS) -> Path:
        if not self.frames:
            raise ValueError("No frames captured")
        path.parent.mkdir(parents=True, exist_ok=True)
        # 540 px is even (fine for H.264 yuv420) but not a multiple of 8; avoid a resize that would stretch frames.
        iio.imwrite(path, np.stack(self.frames), fps=fps, codec="libx264", macro_block_size=4)
        return path

    def close(self) -> None:
        self.renderer.close()

    def __enter__(self) -> FrameRecorder:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
