"""Recorded real-robot datasets (imported JSON under app/data/real), read-only."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.config import DATA_DIR
from app.models.real_data import RealDataset, RealEpisode

REAL_DIR = DATA_DIR / "real"


@lru_cache(maxsize=1)
def load_datasets(root: Path = REAL_DIR) -> dict[str, RealDataset]:
    """Every imported dataset, validated. Files are produced by scripts/import_real_data.py."""
    out: dict[str, RealDataset] = {}
    for f in sorted(root.glob("*.json")):
        ds = RealDataset.model_validate_json(f.read_text())
        out[ds.source.dataset_id] = ds
    return out


def get_episode(dataset_id: str, episode_index: int) -> tuple[RealDataset, RealEpisode] | None:
    ds = load_datasets().get(dataset_id)
    if ds is None:
        return None
    ep = next((e for e in ds.episodes if e.episode_index == episode_index), None)
    return (ds, ep) if ep else None
