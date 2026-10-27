"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, publishSkill, runToCompletion, startDiscover, startTransfer } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { DemoStory, ExperienceCapsule, RobotPassport, RunEvent, RunRecord } from "@/lib/types";
import { Badge, ErrorNote } from "../ui";
import {
  Pending, SceneAdaptation, SceneCapsule, SceneImagination, ScenePassports, SceneSearch, SceneShell,
} from "./scenes";

const SOURCE = "panda_01";
const TARGET = "ur5e_01";
const LIVE_SEED = 7;
const REPLAY_DWELL_MS = 9000;
const LIVE_DWELL_MS = 4000;
const SCENES = ["Discover", "Publish", "Passports", "Imagine", "Adapt"] as const;

type Mode = "replay" | "live";
interface Story { source: { run: RunRecord; capsule: ExperienceCapsule | null } | null; target: { run: RunRecord; capsule: ExperienceCapsule | null } | null }
const EMPTY: Story = { source: null, target: null };

export function PresentationMode() {
  const [mode, setMode] = useState<Mode>("replay");
  const [story, setStory] = useState<Story>(EMPTY);
  const [note, setNote] = useState("");
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);
  const panda = useApi<RobotPassport>(`/api/robots/${SOURCE}`);
  const ur5e = useApi<RobotPassport>(`/api/robots/${TARGET}`);
  const passports = [panda.data, ur5e.data].filter((p): p is RobotPassport => !!p);

  const loadReplay = useCallback(async () => {
    const token = ++runId.current;
    try {
      const s = await apiFetch<DemoStory>("/api/demo/story");
      if (token !== runId.current) return;
      setStory({ source: s.source, target: s.target });
      setNote(s.note);
      setError(s.source ? null : "No recorded runs yet. Switch to Live, or run `make transfer` once.");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (mode !== "replay") return;
    const id = setTimeout(() => void loadReplay(), 0);
    return () => clearTimeout(id);
  }, [mode, loadReplay]);

  // Replay autoplay: advance on a fixed dwell; stops on the last scene.
  useEffect(() => {
    if (!playing || mode !== "replay") return;
    if (scene >= SCENES.length - 1) {
      const id = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setScene((s) => s + 1), REPLAY_DWELL_MS);
    return () => clearTimeout(id);
  }, [playing, mode, scene]);

  const playLive = useCallback(async () => {
    const token = ++runId.current;
    const alive = () => token === runId.current;
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setStory(EMPTY); setScene(0); setEvents([]); setError(null); setBusy(true); setPlaying(true); setNote("");
    try {
      const src = await runToCompletion(() => startDiscover(SOURCE, LIVE_SEED), (ev) => alive() && setEvents((p) => [...p, ev])).done;
      if (!alive()) return;
      setStory({ source: { run: src, capsule: null }, target: null });
      if (src.status !== "succeeded") throw new Error(`Discovery failed: ${src.events.at(-1)?.message ?? src.error}`);
      await pause(LIVE_DWELL_MS); if (!alive()) return;
      setScene(1);
      const capsule = await publishSkill(src.run_id); if (!alive()) return;
      setStory({ source: { run: src, capsule }, target: null });
      await pause(LIVE_DWELL_MS); if (!alive()) return;
      setScene(2);
      await pause(LIVE_DWELL_MS); if (!alive()) return;
      setScene(3); setEvents([]);
      const tgt = await runToCompletion(() => startTransfer(capsule.skill_id, TARGET, null, "offline"),
        (ev) => alive() && setEvents((p) => [...p, ev])).done;
      if (!alive()) return;
      setStory({ source: { run: src, capsule }, target: { run: tgt, capsule: null } });
      if (tgt.status !== "succeeded") throw new Error(`Transfer failed: ${tgt.events.at(-1)?.message ?? tgt.error}`);
      await pause(LIVE_DWELL_MS); if (!alive()) return;
      setScene(4);
      const adapted = await publishSkill(tgt.run_id); if (!alive()) return;
      setStory({ source: { run: src, capsule }, target: { run: tgt, capsule: adapted } });
    } catch (e) {
      if (alive()) setError((e as Error).message);
    } finally {
      if (alive()) { setBusy(false); setPlaying(false); }
    }
  }, []);

  const switchMode = (m: Mode) => {
    runId.current++;
    setMode(m); setPlaying(false); setBusy(false); setScene(0); setEvents([]); setError(null);
    if (m === "live") setStory(EMPTY);
  };

  const togglePlay = useCallback(() => {
    if (mode === "live") { if (!busy) void playLive(); return; }
    setPlaying((p) => { if (!p && scene >= SCENES.length - 1) setScene(0); return !p; });
  }, [mode, busy, playLive, scene]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight") setScene((s) => Math.min(SCENES.length - 1, s + 1));
      if (e.key === "ArrowLeft") setScene((s) => Math.max(0, s - 1));
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay]);

  const src = story.source;
  const tgt = story.target;
  const recordedAt = src?.run.created_at;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-6 py-5 md:px-10">
      <header className="flex flex-wrap items-center gap-4 border-b border-line pb-4">
        <Link href="/" className="font-semibold tracking-tight" title="Exit presentation">AgentNet</Link>
        <span className="hidden text-sm text-ink-3 md:inline">Simulation-verified experience sharing across robot bodies</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {mode === "live" ? <Badge tone="accent">● LIVE · MuJoCo now</Badge>
            : <Badge>REPLAY · recorded {recordedAt ? fmtDateTime(recordedAt) : "—"}</Badge>}
          <div className="flex rounded-lg border border-line p-0.5 text-sm" role="tablist">
            {(["replay", "live"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
                className={`rounded-md px-3 py-1 ${mode === m ? "bg-panel-2 text-ink" : "text-ink-3 hover:text-ink"}`}>
                {m === "replay" ? "Replay recorded" : "Run live"}
              </button>
            ))}
          </div>
          <button onClick={togglePlay} disabled={mode === "live" && busy}
            className="rounded-lg border border-accent-dim bg-accent/15 px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-50">
            {mode === "live" ? (busy ? "Running…" : "▶ Play live demo") : playing ? "❚❚ Pause" : "▶ Play"}
          </button>
        </div>
      </header>

      <nav className="my-5 flex flex-wrap gap-2" aria-label="Scenes">
        {SCENES.map((name, i) => (
          <button key={name} onClick={() => setScene(i)}
            className={`rounded-full border px-3 py-1 text-xs ${i === scene ? "border-accent-dim bg-accent/15 text-accent" : i < scene ? "border-line-strong text-ink-2" : "border-line text-ink-3"}`}>
            {i + 1}. {name}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-ink-3">← → to navigate · space to play</span>
      </nav>

      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <main className="flex-1">
        {scene === 0 && (
          <SceneShell index={1} kicker="Robot A · Panda" title="Searching for a way past the obstacle">
            {src ? <SceneSearch run={src.run} /> : <Pending busy={busy} events={events} label="Press Play to run discovery live." />}
          </SceneShell>
        )}
        {scene === 1 && (
          <SceneShell index={2} kicker="Shared registry" title="Publishing a verified Experience Capsule">
            {src ? <SceneCapsule capsule={src.capsule} run={src.run} canPublish={false} /> : <Pending busy={busy} events={[]} label="Waiting for a verified discovery run." />}
          </SceneShell>
        )}
        {scene === 2 && (
          <SceneShell index={3} kicker="Robot Passports" title="Robot B has a different body">
            <ScenePassports passports={passports} />
          </SceneShell>
        )}
        {scene === 3 && (
          <SceneShell index={4} kicker="Collective Imagination" title="Robot B previews futures in MuJoCo before moving">
            {tgt ? <SceneImagination run={tgt.run} /> : <Pending busy={busy} events={events} label="Waiting for the transfer run." />}
          </SceneShell>
        )}
        {scene === 4 && (
          <SceneShell index={5} kicker="Robot B · UR5e" title="Executing the adaptation and recording its lineage">
            {tgt ? <SceneAdaptation run={tgt.run} capsule={tgt.capsule} sourceCapsule={src?.capsule ?? null} canPublish={false} />
              : <Pending busy={busy} events={events} label="Waiting for the transfer run." />}
          </SceneShell>
        )}
      </main>

      <footer className="mt-6 flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-[11px] text-ink-3">
        <span>All results are MuJoCo simulation only — not physical-world verification. Every number comes from a recorded backend run.</span>
        <span>{note}</span>
      </footer>
    </div>
  );
}
