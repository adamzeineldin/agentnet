"use client";

import type { ReactNode } from "react";
import { apiUrl } from "@/lib/api";
import type { RunRecord, RunStatus } from "@/lib/types";
import { useLiveFrame } from "@/lib/useLiveFrame";
import { routePhrase } from "../transfer/describe";
import { failedChecks, outcomeText } from "./outcomes";
import type { RouteRow, TryInfo } from "./picture";

/** What the screen shows: the live render, the recorded final run, or one physics try's clip. */
export type ScreenView = { kind: "live" } | { kind: "final" } | { kind: "try"; row: RouteRow & { tried: TryInfo } };

interface RunScreenProps {
  runId: string | null;
  run: RunRecord | null;
  busy: boolean;
  view: ScreenView;
  lastStatus: RunStatus | null;
  hasTries: boolean;
  onBack: () => void;
}

/** "Physics try 2 of 3: over@0.08" → "Physics try 2 of 3: over the wall, 8 cm clear". */
function plainLabel(label: string): string {
  const [head, id] = label.split(": ");
  return id?.includes("@") ? `${head}: ${routePhrase(id)}` : label;
}

/** Why the screen is still empty, by the stage the run is in. */
function waitingText(status: RunStatus | null): string {
  if (!status || status === "queued") return "Waiting for its turn on the simulator…";
  if (status === "checking" || status === "proposing" || status === "retrieving")
    return "Working out the arm's joint motion. This is geometry only: nothing moves yet, so there is nothing to film.";
  if (status === "simulating" || status === "selecting" || status === "executing" || status === "verifying")
    return "Starting the camera…";
  return "Setting up the scene…";
}

function Frame({ children, caption, tone = "ink" }: { children: ReactNode; caption: ReactNode; tone?: "ink" | "live" }) {
  return (
    <figure className="min-w-0">
      <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-black">{children}</div>
      <figcaption className={`mt-2 text-sm ${tone === "live" ? "text-ink" : "text-ink-2"}`}>{caption}</figcaption>
    </figure>
  );
}

function Clip({ src, poster }: { src: string; poster?: string }) {
  return (
    <video key={src} src={apiUrl(src)} poster={poster ? apiUrl(poster) : undefined}
      controls autoPlay muted playsInline loop className="size-full object-contain" />
  );
}

function LiveScreen({ runId, busy, lastStatus }: { runId: string | null; busy: boolean; lastStatus: RunStatus | null }) {
  const frame = useLiveFrame(runId, busy);
  if (!frame) {
    return (
      <Frame caption={<span className="text-ink-3">The picture appears as soon as MuJoCo starts moving the arm.</span>}>
        <div className="grid size-full place-items-center bg-panel-2 px-6 text-center text-sm text-ink-2">
          <span><span aria-hidden="true" className="mr-2 inline-block size-2 animate-pulse rounded-full bg-accent" />{waitingText(lastStatus)}</span>
        </div>
      </Frame>
    );
  }
  return (
    <Frame tone="live" caption={plainLabel(frame.label)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- live MuJoCo render, a data URL that changes every frame */}
      <img src={frame.image} alt={`Live simulation: ${plainLabel(frame.label)}`} className="size-full object-contain" />
      <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 font-mono text-[11px] text-white">
        <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-red-500" />LIVE · MuJoCo
      </span>
    </Frame>
  );
}

export function RunScreen({ runId, run, busy, view, lastStatus, hasTries, onBack }: RunScreenProps) {
  if (view.kind === "try") {
    const { row } = view;
    const o = outcomeText(row.tried.outcome);
    const why = row.tried.outcome === "physics_failure" ? failedChecks(row.tried.reason) : "";
    return (
      <Frame caption={
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span>Physics try {row.tried.index}: {routePhrase(row.id)} · <span className={o.tone === "good" ? "text-good" : "text-bad"}>{o.text}{why && ` (${why})`}</span></span>
          <button onClick={onBack} className="text-xs text-accent hover:underline">{busy ? "← back to live" : "← back to the final run"}</button>
        </span>}>
        {row.tried.video ? <Clip src={row.tried.video} poster={row.tried.thumbnail} />
          : <div className="grid size-full place-items-center text-sm text-white/70">This try has no recorded clip.</div>}
      </Frame>
    );
  }
  if (busy || view.kind === "live") return <LiveScreen runId={runId} busy={busy} lastStatus={lastStatus} />;
  if (run?.artifacts.video) {
    return (
      <Frame caption={`Recorded run of the chosen route: ${routePhrase(run.results.selected as string | undefined)}. Played at real speed.`}>
        <Clip src={run.artifacts.video} poster={run.artifacts.poster} />
      </Frame>
    );
  }
  return (
    <Frame caption={hasTries ? "No route passed, so there is no final recording. Pick a physics try to watch it." : "This run stopped before any physics try."}>
      <div className="grid size-full place-items-center bg-panel-2 px-6 text-center text-sm text-ink-2">Nothing passed, so nothing was recorded at the end.</div>
    </Frame>
  );
}
