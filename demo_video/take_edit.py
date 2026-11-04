"""Edits the video around one continuous voice take instead of separate line files.

align(): matches the transcript (build/take_words.json) to the script, line by line. When a line was started
again (its first three words said twice), only the last try is kept and the false start is cut out.
assemble(): lays the take down as one track, cut only in the pauses between lines, so your own pacing and room
sound stay. A shot that needs more time than your pause gives it (typing in the Lab, the end card) gets a little
of your own room tone added there. Returns each shot's length, so the video follows the voice.
"""

from __future__ import annotations

import difflib
import re
import subprocess
from pathlib import Path

PRE_ROLL_S = 0.25  # take kept before the first word
END_ROLL_S = 0.6   # take kept after the last word
JUMP_PAD_S = 0.08  # a cut-out false start ends this long before the retry's first word
EDGE_FADE_S = 0.015
VOICE_CHAIN = "highpass=f=80,acompressor=threshold=-22dB:ratio=2:attack=10:release=200:makeup=1.5"


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower().replace("millimeters", "millimetres"))


def align(lines: list[dict], words: list[dict]) -> list[dict]:
    """Per line: start of its first try, start and end of the kept try, the cut-out span, and the kept words."""
    script = [(k, norm(w)) for k, line in enumerate(lines) for w in line["text"].split()]
    heard = [norm(w["w"]) for w in words]
    anchors: list[list[int]] = [[] for _ in lines]
    matcher = difflib.SequenceMatcher(None, [s for _, s in script], heard, autojunk=False)
    for block in matcher.get_matching_blocks():
        for n in range(block.size):
            anchors[script[block.a + n][0]].append(block.b + n)
    missing = [lines[k]["id"] for k, a in enumerate(anchors) if not a]
    if missing:
        raise SystemExit(f"No words found for {', '.join(missing)}; was a line skipped?")

    tries: list[list[int]] = []
    for k, line in enumerate(lines):
        key = [norm(w) for w in line["text"].split()[:3]]
        lo = max(anchors[k - 1]) + 1 if k else 0
        hi = min(anchors[k + 1]) if k + 1 < len(lines) else len(words)
        # Words the transcript spelled differently ("0 .7") start the line if they follow the longest pause.
        first_anchor = min(anchors[k])
        base = max(range(lo, first_anchor + 1), key=lambda n: words[n]["s"] - (words[n - 1]["e"] if n else 0.0))
        starts = {n for n in range(lo, hi) if heard[n:n + len(key)] == key} | {base}
        tries.append(sorted(starts))

    plan = []
    for k, line in enumerate(lines):
        first, kept = tries[k][0], tries[k][-1]
        last_word = (tries[k + 1][0] if k + 1 < len(lines) else len(words)) - 1
        skip = None
        if kept > first:
            skip = [round(words[first]["s"] - JUMP_PAD_S, 3), round(words[kept]["s"] - JUMP_PAD_S, 3)]
        plan.append({"id": line["id"], "first": words[first]["s"], "s": words[kept]["s"], "e": words[last_word]["e"],
                     "skip": skip, "heard": " ".join(w["w"] for w in words[kept:last_word + 1]),
                     "words": words[kept:last_word + 1]})
    return plan


def room_tone(words: list[dict], take: Path, out: Path) -> None:
    """The quietest stretch between words, trimmed, so inserted pauses sound like your room."""
    gaps = [(words[i + 1]["s"] - words[i]["e"], words[i]["e"]) for i in range(len(words) - 1)]
    length, start = max(gaps)
    keep = max(0.3, length - 0.3)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start + 0.15:.3f}", "-t", f"{keep:.3f}", "-i", str(take),
                    "-af", f"afade=t=in:d=0.05,afade=t=out:st={keep - 0.05:.3f}:d=0.05", "-ac", "1", "-ar", "48000", str(out)],
                   check=True)


def assemble(plan: list[dict], needs: list[tuple[float, float]], take: Path, take_len: float, workdir: Path,
             words: list[dict]) -> tuple[Path, list[float], list[tuple[str, float, list[dict]]]]:
    """needs[k] = (speech start wanted in shot k, shortest shot k). Returns the voice track, shot lengths, and per
    line (id, time its piece starts in the video, its words with times relative to that start) for captions."""
    n = len(plan)
    cuts = [max(0.0, plan[0]["first"] - PRE_ROLL_S)]
    cuts += [(plan[k - 1]["e"] + plan[k]["first"]) / 2 for k in range(1, n)]
    cuts.append(min(take_len, plan[-1]["e"] + END_ROLL_S))

    tone = workdir / "room_tone.wav"
    room_tone(words, take, tone)
    chunks: list[tuple[str, float, float]] = []  # ("take", start, end) or ("tone", 0, length)
    lengths, caption_lines, t = [], [], 0.0
    for k, line in enumerate(plan):
        c0, c1 = cuts[k], cuts[k + 1]
        sources = [(c0, line["skip"][0]), (line["skip"][1], c1)] if line["skip"] else [(c0, c1)]
        piece = sum(b - a for a, b in sources)
        offset = line["first"] - c0
        want_at, shortest = needs[k]
        pre = max(0.0, want_at - offset) if want_at >= 1.0 else 0.0
        post = max(0.0, shortest - pre - piece)
        if pre:
            chunks.append(("tone", 0.0, pre))
        chunks += [("take", a, b) for a, b in sources]
        if post:
            chunks.append(("tone", 0.0, post))
        cut_out = (line["skip"][1] - line["skip"][0]) if line["skip"] else 0.0
        rel = [{**w, "s": w["s"] - c0 - cut_out, "e": w["e"] - c0 - cut_out} for w in line["words"]]
        caption_lines.append((line["id"], t + pre, rel))
        lengths.append(round(pre + piece + post, 3))
        t += lengths[-1]

    inputs, graph = [], ""
    for i, (kind, a, b) in enumerate(chunks):
        if kind == "take":
            inputs += ["-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", str(take)]
        else:
            inputs += ["-stream_loop", "-1", "-t", f"{b:.3f}", "-i", str(tone)]
        d = b - a
        graph += (f"[{i}:a]aresample=48000,aformat=channel_layouts=mono,atrim=duration={d:.3f},"
                  f"afade=t=in:d={EDGE_FADE_S},afade=t=out:st={max(0.0, d - EDGE_FADE_S):.3f}:d={EDGE_FADE_S}[c{i}];")
    graph += "".join(f"[c{i}]" for i in range(len(chunks))) + f"concat=n={len(chunks)}:v=0:a=1,{VOICE_CHAIN}[out]"
    voice = workdir / "voice_track.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", "[out]",
                    "-ar", "48000", str(voice)], check=True)
    return voice, lengths, caption_lines
