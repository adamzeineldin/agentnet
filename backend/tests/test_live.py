from __future__ import annotations

import numpy as np

from app.services.live import LiveFrames

FRAME = np.zeros((18, 32, 3), dtype=np.uint8)


def test_first_frame_is_published_as_jpeg():
    live = LiveFrames(min_interval_s=10.0)
    live.publish("r1", FRAME, "try 1")
    frame = live.get("r1")
    assert frame is not None and frame.seq == 1 and frame.label == "try 1"
    assert frame.jpeg[:2] == b"\xff\xd8"


def test_frames_within_one_label_are_throttled_but_a_new_label_shows_at_once():
    live = LiveFrames(min_interval_s=10.0)
    live.publish("r1", FRAME, "try 1")
    live.publish("r1", FRAME, "try 1")
    assert live.get("r1").seq == 1
    live.publish("r1", FRAME, "try 2")
    assert (live.get("r1").seq, live.get("r1").label) == (2, "try 2")


def test_runs_are_kept_apart_and_cleared():
    live = LiveFrames(min_interval_s=0.0)
    live.sink("a", "x")(FRAME)
    live.sink("b", "y")(FRAME)
    live.clear("a")
    assert live.get("a") is None and live.get("b").label == "y"


def test_buffer_returns_frames_after_a_seq_with_increasing_times():
    live = LiveFrames(min_interval_s=0.0)
    for _ in range(5):
        live.publish("r1", FRAME, "try 1")
    frames = live.since("r1", 2)
    assert [f.seq for f in frames] == [3, 4, 5]
    assert frames[0].t <= frames[1].t <= frames[2].t
    assert live.since("r1", 5) == [] and live.since("other", 0) == []


def test_buffer_keeps_only_the_most_recent_frames():
    from app.services.live import BUFFER_FRAMES

    live = LiveFrames(min_interval_s=0.0)
    for _ in range(BUFFER_FRAMES + 10):
        live.publish("r1", FRAME, "try 1")
    frames = live.since("r1", 0)
    assert len(frames) == BUFFER_FRAMES and frames[-1].seq == BUFFER_FRAMES + 10
