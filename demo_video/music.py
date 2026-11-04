"""Background music made from scratch (no samples, no licences): upbeat acoustic, hands-on "makers" style.

G, D, Em, C at 112 BPM: strummed steel-string guitar (Karplus-Strong), a picked bass, kick, hand claps on 2 and 4,
a shaker, and a short bell hook that comes and goes. Two bars of guitar alone to open, a last strum to close.
Usage: backend/.venv/bin/python music.py <seconds> <out.wav>
"""

from __future__ import annotations

import sys
import wave
from functools import lru_cache

import numpy as np

SR = 44100
BPM = 112
BEAT = 60 / BPM
BAR = 4 * BEAT
EIGHTH = BEAT / 2
CHORDS = [  # one chord per bar: open guitar voicings (midi), bass root (midi)
    ([43, 47, 50, 55, 59, 67], 43),  # G
    ([50, 57, 62, 66], 38),          # D
    ([40, 47, 52, 55, 59, 64], 40),  # Em
    ([48, 52, 55, 60, 64], 36),      # C
]
STRUMS = [(0, "down", 1.0), (2, "down", 0.8), (3, "up", 0.55), (5, "up", 0.6), (6, "down", 0.75), (7, "up", 0.5)]
BELL_HOOK = [(0, 74), (1, 71), (2, 67), (3, 69), (4, 71), (6, 67)]  # (eighth, midi) over two bars
RNG = np.random.default_rng(11)


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


@lru_cache(maxsize=None)
def string(midi: int, seconds: float = 2.2, damp: float = 0.996) -> np.ndarray:
    """Karplus-Strong plucked string, rendered once per note."""
    period = int(round(SR / hz(midi)))
    buf = RNG.uniform(-1, 1, period)
    buf = np.convolve(buf, [0.5, 0.5], mode="same")  # softer pick
    n = int(seconds * SR)
    out = np.empty(n)
    for i in range(n):
        j = i % period
        nxt = buf[(j + 1) % period]
        out[i] = buf[j]
        buf[j] = damp * 0.5 * (buf[j] + nxt)
    attack = np.clip(np.arange(n) / (0.002 * SR), 0, 1)
    return out * attack


def place(track: np.ndarray, sound: np.ndarray, when: float, gain: float) -> None:
    a = int(when * SR)
    if a >= len(track) or a < 0:
        return
    b = min(len(track), a + len(sound))
    track[a:b] += sound[: b - a] * gain


@lru_cache(maxsize=None)
def kick() -> np.ndarray:
    t = np.arange(int(0.35 * SR)) / SR
    freq = 50 + 70 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.12)


@lru_cache(maxsize=None)
def clap() -> np.ndarray:
    t = np.arange(int(0.25 * SR)) / SR
    noise = RNG.standard_normal(len(t))
    bursts = sum(np.exp(-np.clip(t - d, 0, None) / 0.006) * (t >= d) for d in (0.0, 0.011, 0.023))
    body = np.exp(-t / 0.06)
    sig = noise * (0.6 * bursts + 0.5 * body)
    return np.diff(sig, prepend=0) * 0.6 + sig * 0.25  # a crude high-pass keeps it bright


@lru_cache(maxsize=None)
def shaker() -> np.ndarray:
    t = np.arange(int(0.08 * SR)) / SR
    sig = RNG.standard_normal(len(t)) * np.clip(t / 0.01, 0, 1) * np.exp(-t / 0.025)
    return np.diff(sig, prepend=0)


@lru_cache(maxsize=None)
def bell(midi: int) -> np.ndarray:
    t = np.arange(int(1.4 * SR)) / SR
    f = hz(midi)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2.0 * f * t) * np.exp(-t / 0.2)
            + 0.15 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t / 0.1)) * np.exp(-t / 0.5) * np.clip(t / 0.003, 0, 1)


def strum(left: np.ndarray, right: np.ndarray, notes: list[int], when: float, direction: str, velocity: float) -> None:
    order = notes if direction == "down" else list(reversed(notes))[:4]
    spread = 0.012 if direction == "down" else 0.008
    for k, note in enumerate(order):
        s = string(note) * (0.6 if direction == "up" else 1.0)
        pan = 0.35 + 0.3 * (notes.index(note) / max(1, len(notes) - 1))
        g = velocity * RNG.uniform(0.85, 1.0) * 0.11
        place(left, s, when + k * spread, g * (1 - pan) * 1.4)
        place(right, s, when + k * spread, g * pan * 1.4)


def main() -> None:
    total, out_path = float(sys.argv[1]), sys.argv[2]
    n = int(total * SR)
    left, right = np.zeros(n), np.zeros(n)
    bars = int(total / BAR)
    last_bar = max(2, bars - 1)
    for bar in range(bars):
        start = bar * BAR
        notes, root = CHORDS[bar % len(CHORDS)]
        if bar == last_bar:
            strum(left, right, CHORDS[0][0], start, "down", 1.0)  # final ringing G
            break
        for eighth, direction, vel in STRUMS:
            strum(left, right, notes, start + eighth * EIGHTH + RNG.uniform(-0.004, 0.004), direction, vel)
        if bar < 2:
            continue  # intro: guitar alone
        for beat in (0, 2):
            place(left, kick(), start + beat * BEAT, 0.5)
            place(right, kick(), start + beat * BEAT, 0.5)
        place(left, kick(), start + 2.5 * BEAT, 0.25)
        place(right, kick(), start + 2.5 * BEAT, 0.25)
        for beat in (1, 3):
            place(left, clap(), start + beat * BEAT, 0.16)
            place(right, clap(), start + beat * BEAT + 0.004, 0.14)
        for e in range(8):
            place(left if e % 2 else right, shaker(), start + e * EIGHTH, 0.05 if e % 2 else 0.035)
        for offset, vel in ((0.0, 1.0), (1.5 * BEAT, 0.6), (2 * BEAT, 0.85), (3.5 * BEAT, 0.5)):
            s = string(root, seconds=1.0, damp=0.993)
            place(left, s, start + offset, 0.2 * vel)
            place(right, s, start + offset, 0.2 * vel)
        if (bar // 4) % 2 == 1 and bar % 2 == 0:  # bell hook on alternate four-bar phrases
            for eighth, midi in BELL_HOOK:
                b = bell(midi)
                place(left, b, start + eighth * EIGHTH, 0.05)
                place(right, b, start + eighth * EIGHTH + 0.01, 0.06)

    # A short room so it doesn't sound dry, then fades.
    for ch in (left, right):
        ch += np.concatenate([np.zeros(int(0.031 * SR)), ch[: -int(0.031 * SR)]]) * 0.18
    t = np.arange(n) / SR
    fade = np.clip(t / 0.8, 0, 1) * np.clip((total - t) / 3.0, 0, 1)
    stereo = np.stack([left * fade, right * fade], axis=1)
    stereo /= np.max(np.abs(stereo)) / 0.89
    with wave.open(out_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((stereo * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    main()
