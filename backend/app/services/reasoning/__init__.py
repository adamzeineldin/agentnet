"""Reasoning providers: deterministic offline prior, or Meta Muse Spark when configured."""

from __future__ import annotations

from app.config import META_MODEL_ID, MODEL_API_KEY
from app.services.reasoning.base import ReasoningProvider
from app.services.reasoning.meta_muse import MetaMuseProvider, MetaReasoningError
from app.services.reasoning.offline import OfflinePlanner


def meta_available() -> bool:
    return bool(MODEL_API_KEY)


def get_provider(mode: str) -> ReasoningProvider:
    if mode == "offline":
        return OfflinePlanner()
    if mode == "meta":
        if not MODEL_API_KEY:
            raise MetaReasoningError("MODEL_API_KEY is not configured")
        return MetaMuseProvider(MODEL_API_KEY, META_MODEL_ID)
    raise ValueError(f"unknown reasoning mode {mode!r}")
