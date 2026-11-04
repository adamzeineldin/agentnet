"""Splits one full voice take into the 16 narration lines (vo/<id>.wav), cutting at the longest pauses.

Usage: python3 split_take.py <your recording>  [--dry-run]
Read the lines in order with a clear pause (about 2 s) between them. The 15 longest pauses become the cuts.
Each piece gets a high-pass, light noise reduction and gentle compression; build.py then levels the whole mix.
It prints each piece next to the placeholder's length so a missed or doubled line stands out before you build.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
PAUSE_DB = "-38dB"
MIN_PAUSE_S = 0.45
PAD_S = 0.12  # silence kept at each end of a line
VOICE_FILTER = "highpass=f=80,afftdn=nf=-28,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2"


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=True, capture_output=True, text=True)


def duration(path: Path) -> float:
    return float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)).stdout)


def pauses(take: Path) -> list[tuple[float, float]]:
    log = run("ffmpeg", "-hide_banner", "-nostats", "-i", str(take), "-af",
              f"silencedetect=noise={PAUSE_DB}:d={MIN_PAUSE_S}", "-f", "null", "-").stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    return list(zip(starts, ends))


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    take, dry = Path(sys.argv[1]).expanduser(), "--dry-run" in sys.argv
    lines = json.loads((ROOT / "narration.json").read_text())
    total = duration(take)
    gaps = pauses(take)
    lead = gaps[0][1] if gaps and gaps[0][0] < 0.05 else 0.0  # silence before the first word
    tail = gaps[-1][0] if gaps and gaps[-1][1] > total - 0.05 else total
    inner = [g for g in gaps if g[0] > lead + 0.05 and g[1] < tail - 0.05]
    if len(inner) < len(lines) - 1:
        sys.exit(f"Found only {len(inner)} pauses for {len(lines)} lines; pause longer between lines and re-record.")
    cuts = sorted(sorted(inner, key=lambda g: g[1] - g[0], reverse=True)[: len(lines) - 1])
    bounds = [lead] + [x for g in cuts for x in g] + [tail]
    pieces = [(bounds[2 * k], bounds[2 * k + 1]) for k in range(len(lines))]

    print(f"{'id':<6}{'yours':>7}{'tts':>7}  first words")
    for line, (a, b) in zip(lines, pieces):
        tts = ROOT / "vo" / f"{line['id']}.mp3"
        ref = f"{duration(tts):7.1f}" if tts.exists() else "      -"
        print(f"{line['id']:<6}{b - a:7.1f}{ref}  {' '.join(line['text'].split()[:6])}…")
        if dry:
            continue
        start, length = max(0.0, a - PAD_S), b - a + 2 * PAD_S
        run("ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(take),
            "-af", VOICE_FILTER, "-ac", "1", "-ar", "48000", str(ROOT / "vo" / f"{line['id']}.wav"))
    print("dry run: nothing written" if dry else "wrote vo/<id>.wav; run python3 build.py")


if __name__ == "__main__":
    main()
