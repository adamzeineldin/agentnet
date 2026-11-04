"use client";

import { useState, type ReactNode } from "react";
import type { RunEvent, RunRecord, SkillMetrics } from "@/lib/types";
import { pictureFromEvents, pictureFromRun, triesOf, type RouteRow, type TryInfo } from "../run/picture";
import { RunScreen, type ScreenView } from "../run/RunScreen";
import { RunSteps, title, type StepNames } from "../run/RunSteps";
import { stageStates, type RunKind } from "../run/stages";
import { RunProgress } from "../transfer/RunProgress";
import { routePhrase } from "../transfer/describe";
import { Disclosure } from "../ui";
import { RunSummary, type Compared } from "./RunSummary";

interface LabRunProps {
  kind: RunKind;
  runId: string | null;
  events: RunEvent[];
  run: RunRecord | null;
  busy: boolean;
  names: StepNames;
  saved: SkillMetrics | null;
  compare: Compared | null;
  /** Extra detail for the closed "How it was found" section (e.g. a transfer's joint mapping and log). */
  details?: ReactNode;
}

type Tried = RouteRow & { tried: TryInfo };

function TryButtons({ tries, watching, onWatch }: { tries: Tried[]; watching: string | null; onWatch: (t: Tried) => void }) {
  return (
    <div role="group" aria-label="Physics tries" className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs">
      <span className="mr-1 text-ink-3">Watch a try</span>
      {tries.map((t) => {
        const ok = t.tried.outcome === "verified";
        return (
          <button key={t.id} type="button" onClick={() => onWatch(t)} aria-pressed={watching === t.id}
            title={`${routePhrase(t.id)}: ${ok ? "passed" : "failed"} the physics test`}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${watching === t.id
              ? "bg-panel-2 text-ink" : "text-ink-2 hover:bg-panel-2/60 hover:text-ink"}`}>
            <span aria-hidden="true" className={`size-1.5 rounded-full ${ok ? "bg-good" : "bg-bad"}`} />
            Try {t.tried.index} · {routePhrase(t.id)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A run in the Lab: the MuJoCo picture beside its progress (while running) or its measured result (once done), and
 * the physics tries to watch. Every stage, check and log line stays in one closed section underneath.
 */
export function LabRun({ kind, runId, events, run, busy, names, saved, compare, details }: LabRunProps) {
  const [view, setView] = useState<ScreenView>({ kind: "live" });
  const finished = run !== null && !busy;
  const pic = finished ? pictureFromRun(run) : pictureFromEvents(events);
  const stages = stageStates(kind, finished ? run.events : events);
  const active = stages.find((s) => s.state === "active");
  const tries = triesOf(pic);
  const watching = view.kind === "try" ? view.row.id : null;
  const shown: ScreenView = view.kind === "try" ? view : finished ? { kind: "final" } : { kind: "live" };
  const watch = (row: Tried) => setView({ kind: "try", row });

  return (
    <div className="space-y-4">
      {busy && <RunProgress events={events} message={active && `Now: ${title(active.key, kind, names, pic).replace(/:.*/, "")}`} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <RunScreen runId={runId} run={run} busy={busy} view={shown} lastStatus={pic.lastStatus}
          hasTries={tries.length > 0} onBack={() => setView({ kind: "live" })} />
        <RunSummary kind={kind} busy={busy} run={run} pic={pic} stages={stages} names={names} saved={saved} compare={compare} />
      </div>
      {tries.length > 0 && <TryButtons tries={tries} watching={watching} onWatch={watch} />}
      {(finished || stages.some((s) => s.state !== "pending")) && (
        <Disclosure summary="How it was found" hint="every step, check and log line">
          <div className="space-y-6">
            <RunSteps kind={kind} stages={stages} pic={pic} names={names} watching={watching} onWatch={watch} />
            {details}
          </div>
        </Disclosure>
      )}
    </div>
  );
}
