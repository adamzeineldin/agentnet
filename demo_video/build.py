"""Cuts the demo video from the recorded clips, title cards, labels and voiceover.

Each segment is footage (clip, start) that lasts as long as its voice line needs; when the footage runs out the
last frame is held. Usage: python3 build.py  ->  out/nimbotics_demo.mp4
Your own voice: drop vo/<id>.wav or .m4a next to the .mp3 (same id) and rebuild; it is used instead.
"""

from __future__ import annotations

import difflib
import json
import re
import subprocess
from dataclasses import dataclass, field, replace
from pathlib import Path

from take_edit import assemble

ROOT = Path(__file__).parent
CLIPS = ROOT / "build/clips"
LABELS = ROOT / "build/labels"
SEGS = ROOT / "build/segments"
OUT = ROOT / "out"
FPS = 30
TAIL = 0.35  # breath after each line
MUSIC_GAIN = 0.0  # 0 = no music; 0.14 put the music about 13 dB under the voice (ducked further while you speak)


@dataclass(frozen=True)
class Seg:
    clip: str
    start: float | None  # None: carry on in the same clip where the previous segment ended
    vo: str | None = None
    vo_at: float = 0.3
    min_len: float = 0.0
    until: float | None = None  # last clip time to show; the frame there is held after
    fit: bool = False  # play the footage faster or slower so it spans the line (animations follow your pace)
    zoom: tuple[float, float, float] | None = None  # (center x, center y, zoom) in 1920x1080 pixels
    labels: tuple[tuple[str, float, float], ...] = field(default=())  # (label, from, to); to<0 = until end+to
    fade_in: float = 0.0
    fade_out: float = 0.0
    note: str | None = None


TIMELINE: tuple[Seg, ...] = (
    Seg("card_hook", 0.0, "v01", 0.5, fade_in=0.6, fit=True),
    Seg("present", 1.2, "v02", 0.3, labels=(("passport", 0.8, -0.6),)),
    Seg("home", 0.0, "v03", 0.4, fit=True),
    Seg("lab", 0.6, "v04", 2.4, min_len=8.6),
    Seg("lab", None, "v05a", 0.2, until=15.2, labels=(("match", 0.4, -0.2),)),
    Seg("question", 14.0, "v05b", 0.1, labels=(("match", 0.0, -0.4),)),
    Seg("lab", 16.3, "v06", 0.3, labels=(("librarian", 0.6, 7.0),)),
    Seg("lab", None, "v07", 0.2, labels=(("rank", 0.6, -0.4),)),
    Seg("lab", None, "v08", 0.2, labels=(("result", 0.4, 6.0),)),
    Seg("lab", 55.3, "v09", 0.2, zoom=(800, 680, 1.35), labels=(("audit", 0.6, -0.4),)),
    Seg("designer_ur5e_fail", 38.8, "v09b", 0.2, labels=(("design", 0.9, -0.4),)),
    Seg("designer_ur5e_fail", 59.9, "v09c", 0.2, labels=(("fail", 0.6, -0.3),)),
    Seg("card_muse", 0.0, "v10", 0.4, fade_in=0.25, fit=True),
    Seg("card_evidence", 0.0, "v11", 0.3, fade_in=0.25, fit=True),
    Seg("library", 0.8, "v12", 0.3, min_len=9.0, labels=(("library", 6.0, -0.3),)),
    Seg("card_end", 0.0, "v13", 0.4, min_len=8.0, fade_in=0.25, fade_out=1.6),
)


def run(*args: str) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def duration(path: Path) -> float:
    return float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)))


def vo_file(vo_id: str) -> Path:
    for ext in (".wav", ".m4a", ".mp3"):
        p = ROOT / "vo" / f"{vo_id}{ext}"
        if p.exists():
            return p
    raise FileNotFoundError(f"no voice file for {vo_id}")


def seg_length(seg: Seg) -> float:
    need = seg.vo_at + duration(vo_file(seg.vo)) + TAIL if seg.vo else 0.0
    return round(max(need, seg.min_len), 3)


def zoom_filter(cx: float, cy: float, z: float) -> str:
    ramp = f"(1-pow(1-min(1,on/{int(FPS * 0.9)}),3))"
    zexpr = f"1+{z - 1}*{ramp}"
    x = f"max(0,min(iw-iw/zoom,{cx}-iw/zoom/2))"
    y = f"max(0,min(ih-ih/zoom,{cy}-ih/zoom/2))"
    # Upscale first so the crop window moves in sub-pixel steps (no zoompan jitter).
    return f"scale=3840:2160:flags=lanczos,zoompan=z='{zexpr}':x='{x}':y='{y}':d=1:s=1920x1080:fps={FPS}"


def render_segment(i: int, seg: Seg, length: float | None = None) -> tuple[Path, float]:
    length = length if length is not None else seg_length(seg)
    clip = CLIPS / f"{seg.clip}.mp4"
    avail = (seg.until if seg.until is not None else duration(clip)) - seg.start
    hold = max(0.0, length - avail) + 0.1
    if seg.fit:
        chain = [f"trim=duration={avail:.3f}", f"setpts=(PTS-STARTPTS)*{length / avail:.5f}", f"fps={FPS}",
                 f"tpad=stop_mode=clone:stop_duration=0.5,trim=duration={length}", "setpts=PTS-STARTPTS"]
    elif hold <= 0.1:
        chain = [f"trim=duration={length}", "setpts=PTS-STARTPTS"]
    else:
        chain = [f"trim=duration={avail:.3f}", "setpts=PTS-STARTPTS", f"tpad=stop_mode=clone:stop_duration={hold:.3f}",
                 f"trim=duration={length}", "setpts=PTS-STARTPTS"]
    if seg.zoom:
        cx, cy, z = seg.zoom
        chain.append(zoom_filter(cx * 2, cy * 2, z))
    if seg.fade_in:
        chain.append(f"fade=t=in:st=0:d={seg.fade_in}")
    if seg.fade_out:
        chain.append(f"fade=t=out:st={length - seg.fade_out:.3f}:d={seg.fade_out}")
    inputs = ["-ss", f"{seg.start}", "-i", str(clip)]
    graph = f"[0:v]{','.join(chain)},format=yuv420p[v0]"
    last = "v0"
    for k, (name, a, b) in enumerate(seg.labels):
        b = length + b if b < 0 else b
        inputs += ["-loop", "1", "-t", f"{length}", "-i", str(LABELS / f"{name}.png")]
        graph += (f";[{k + 1}:v]format=rgba,fade=t=in:st={a}:d=0.35:alpha=1,fade=t=out:st={b - 0.35:.3f}:d=0.35:alpha=1[l{k}]"
                  f";[{last}][l{k}]overlay=0:0:format=auto[v{k + 1}]")
        last = f"v{k + 1}"
    out = SEGS / f"{i:02d}_{seg.clip}.mp4"
    run("ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", f"[{last}]",
        "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-an", str(out))
    return out, length


def music(total: float, path: Path) -> None:
    """Your own track if demo_video/music_track.(mp3|m4a|wav) exists (looped or trimmed to fit, levelled), else
    the original track from music.py, rendered with the backend venv, which has numpy."""
    if MUSIC_GAIN <= 0:  # no music: a silent bed keeps the mix the same
        run("ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", f"{total:.3f}", str(path))
        return
    track = next((ROOT / f"music_track{ext}" for ext in (".mp3", ".m4a", ".wav") if (ROOT / f"music_track{ext}").exists()), None)
    if track:
        run("ffmpeg", "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", str(track), "-t", f"{total:.3f}",
            "-af", f"loudnorm=I=-16:TP=-1.5,afade=t=in:d=1.5,afade=t=out:st={total - 3:.3f}:d=3", "-ar", "48000", "-ac", "2",
            str(path))
        return
    subprocess.run([str(ROOT.parent / "backend/.venv/bin/python"), str(ROOT / "music.py"), f"{total:.3f}", str(path)],
                   check=True)


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower())


def stamp(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def write_captions(cues: list[tuple[str, float]], path: Path, spoken: dict[str, list[dict]] | None = None) -> None:
    """Captions from the narration text, split by sentence; timed by your words when there is a take, else by length."""
    text = {line["id"]: line["text"] for line in json.loads((ROOT / "narration.json").read_text())}
    spoken = spoken or {}
    entries: list[tuple[float, float, str]] = []
    for vo_id, at in cues:
        parts = [p for p in re.split(r"(?<=[.?!:])\s+", text[vo_id]) if p]
        heard = spoken.get(vo_id)
        if heard:
            # Your recording: match the sentence's words to what you said, so it shows while you say it.
            cuts, said = [], [norm(w["w"]) for w in heard]
            sentence_of = [k for k, p in enumerate(parts) for _ in p.split()]
            matcher = difflib.SequenceMatcher(None, [norm(w) for p in parts for w in p.split()], said, autojunk=False)
            last = [-1] * len(parts)
            for blk in matcher.get_matching_blocks():
                for m in range(blk.size):
                    last[sentence_of[blk.a + m]] = blk.b + m
            for k in range(len(parts)):
                fallback = round(len(heard) * sum(len(p.split()) for p in parts[: k + 1]) / len(sentence_of)) - 1
                cuts.append(max(last[k] if last[k] >= 0 else fallback, cuts[-1] + 1 if cuts else 0))
            cuts[-1] = len(heard) - 1
            for k, p in enumerate(parts):
                first = cuts[k - 1] + 1 if k else 0
                s, e = heard[min(first, len(heard) - 1)]["s"], heard[min(cuts[k], len(heard) - 1)]["e"]
                entries.append((at + s, at + max(e, s + 0.5) + 0.2, p))
            continue
        total_chars, dur, t = sum(len(p) for p in parts), duration(vo_file(vo_id)), at
        for p in parts:
            d = dur * len(p) / total_chars
            entries.append((t, t + d, p))
            t += d
    ends = [min(e, nxt[0] - 0.05) for (_, e, _), nxt in zip(entries, entries[1:] + [(1e9, 0, "")])]
    path.write_text("\n".join(f"{k + 1}\n{stamp(s)} --> {stamp(e)}\n{p}\n" for k, ((s, _, p), e) in enumerate(zip(entries, ends))))


def main() -> None:
    SEGS.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(exist_ok=True)
    plan_file = ROOT / "build/take_plan.json"
    voice, lengths, spoken = None, [None] * len(TIMELINE), None
    if plan_file.exists():  # your full take sets the pace (take_edit.py)
        plan = json.loads(plan_file.read_text())
        voice, lengths, caption_lines = assemble(plan["lines"], [(s.vo_at, s.min_len) for s in TIMELINE], Path(plan["take"]),
                                                 plan["take_len"], ROOT / "build", plan["words"])
        spoken = {vo_id: rel for vo_id, _, rel in caption_lines}
        line_at = [at for _, at, _ in caption_lines]
    parts, t, cues, timing = [], 0.0, [], []
    prev_end = 0.0
    for i, seg in enumerate(TIMELINE):
        if seg.start is None:
            seg = replace(seg, start=prev_end)
        if voice and (CLIPS / f"{seg.clip}_take.mp4").exists():  # recorded in step with your take (record_timed.mjs)
            seg = replace(seg, clip=f"{seg.clip}_take", start=0.0, fit=False)
        out, length = render_segment(i, seg, lengths[i])
        if voice:
            timing.append({"i": i, "clip": seg.clip, "vo": seg.vo, "start": round(t, 3), "length": length,
                           "words": [{**w, "s": round(line_at[i] - t + w["s"], 3), "e": round(line_at[i] - t + w["e"], 3)}
                                     for w in spoken[seg.vo]]})
        prev_end = seg.start + length
        parts.append(out)
        if seg.vo:
            cues.append((seg.vo, line_at[i] if voice else t + seg.vo_at))
        print(f"{i:02d} {seg.clip:<20} {t:7.2f}s  +{length:5.2f}s  {seg.vo or ''}")
        t += length
    total = t
    concat = SEGS / "list.txt"
    concat.write_text("".join(f"file '{p}'\n" for p in parts))
    video = ROOT / "build/video.mp4"
    run("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(video))

    bed = ROOT / "build/music.wav"
    music(total, bed)
    # Music sits about 13 dB under the voice and dips a little more while you speak (sidechain ducking).
    inputs, graph = ["-i", str(bed)], f"[0:a]aresample=48000,highpass=f=40,volume={MUSIC_GAIN}[m]"
    voices = [(voice, 0.0)] if voice else [(vo_file(vo_id), at) for vo_id, at in cues]
    for k, (path, at) in enumerate(voices):
        inputs += ["-i", str(path)]
        ms = int(at * 1000)
        graph += f";[{k + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms},apad[a{k}]"
    graph += f";{''.join(f'[a{k}]' for k in range(len(voices)))}amix=inputs={len(voices)}:normalize=0:duration=longest[v]"
    graph += (";[v]asplit=2[vkey][vmix];[m][vkey]sidechaincompress=threshold=0.02:ratio=3:attack=80:release=900[md]"
              ";[md][vmix]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[out]")
    audio = ROOT / "build/audio.wav"
    run("ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", str(audio))

    final = OUT / "nimbotics_demo.mp4"
    run("ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-i", str(audio), "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(final))
    write_captions(cues, OUT / "nimbotics_demo.srt", spoken)
    if voice:
        (ROOT / "build/take_timing.json").write_text(json.dumps(timing, indent=0))
    (ROOT / "build/cues.json").write_text(json.dumps({"total": total, "cues": cues}, indent=1))
    print(f"total {total:.1f}s -> {final}")


if __name__ == "__main__":
    main()
