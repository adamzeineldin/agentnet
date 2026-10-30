"""Recorded real-robot data imported from public datasets (read-only; see scripts/import_real_data.py)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class RealDataSource(BaseModel):
    model_config = ConfigDict(frozen=True)
    dataset_id: str
    title: str
    url: str
    revision: str
    license: str
    citation: str
    recorded_robot: str
    recorded_robot_id: str
    fps: float
    frame: str
    state_fields: list[str]
    notes: list[str] = Field(default_factory=list)


class RealEpisode(BaseModel):
    model_config = ConfigDict(frozen=True)
    episode_index: int
    task: str
    frames: int
    duration_s: float
    ee_xyz: list[tuple[float, float, float]]
    gripper: list[float]


class RealDataset(BaseModel):
    model_config = ConfigDict(frozen=True)
    schema_version: str = "1.0"
    source: RealDataSource
    selection: str
    imported_at: str
    episodes: list[RealEpisode]


class RealReplayRequest(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    dataset_id: str
    episode_index: int = Field(ge=0)
    robot_id: str = "ur5e_01"
    execute_on: str = Field(default="none", pattern="^(none|ursim)$")
