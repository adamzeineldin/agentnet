"use client";

import { useState, type ReactNode } from "react";
import { baseInTask } from "@/lib/placement";
import type { Placement, RunEvent, RunRecord, Vec3 } from "@/lib/types";
import { pictureFromEvents, pictureFromRun, triesOf, type RouteRow, type RunPicture, type TryInfo } from "../run/picture";
import { RunScreen, type ScreenView } from "../run/RunScreen";
import { RunSteps, title, type StepNames } from "../run/RunSteps";
import { stageStates, type RunKind } from "../run/stages";
import { RunProgress } from "../transfer/RunProgress";
import { routePhrase } from "../transfer/describe";
import { Disclosure } from "../ui";
import type { RouteTone, SceneRoute } from "./scene3d/build";
import { Scene3D } from "./scene3d/Scene3D";

interface LabRunProps {
  kind: RunKind;
  runId: string | null;
  events: RunEvent[];
  run: RunRecord | null;
  busy: boolean;
  names: StepNames;
  /** Extra detail for the closed "How it was found" section (e.g. a transfer's joint mapping and log). */
  details?: ReactNode;
}

type Tried = RouteRow & { tried: TryInfo };

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function toneOf(r: RouteRow, selected: string | undefined): RouteTone {
  if (r.id === selected && r.tried?.outcome === "verified") return "chosen";
  if (r.tried) return r.tried.outcome === "verified" ? "passed" : "failed";
  if (!r.check) return "pending";
  return r.check.possible ? "possible" : "failed";
}

/** Tried routes follow the hand path MuJoCo recorded; the rest are drawn along their planned waypoints. */
const sceneRoutes = (pic: RunPicture): SceneRoute[] => pic.routes.map((r) => ({
  id: r.id, tone: toneOf(r, pic.selected), points: r.tried?.trace?.length ? r.tried.trace : r.waypoints,
}));

/** The robot base (or an uploaded arm's mount) in the task frame. */
function baseOf(p: Placement | undefined): Vec3 | null {
  return p ? baseInTask(p) : null;
}

/** One sentence with the counts, instead of a stage-by-stage list. */
function summary(pic: RunPicture, tries: Tried[], busy: boolean): string | null {
  if (!pic.routes.length) return null;
  const checked = pic.routes.filter((r) => r.check);
  const possible = checked.filter((r) => r.check?.possible).length;
  const passed = tries.filter((t) => t.tried.outcome === "verified").length;
  const routes = `${checked.length} of ${pic.routes.length} routes checked against its joints, ${possible} possible`;
  const physics = tries.length ? `; ${tries.length} tried in physics, ${passed} passed` : "";
  return `${busy ? "So far: " : ""}${routes}${physics}.`;
}

function TryButtons({ tries, watching, onWatch }: { tries: Tried[]; watching: string | null; onWatch: (t: Tried) => void }) {
  return (
    <div role="group" aria-label="Physics tries" className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-3">Watch a try</span>
      {tries.map((t) => {
        const ok = t.tried.outcome === "verified";
        return (
          <button key={t.id} type="button" onClick={() => onWatch(t)} aria-pressed={watching === t.id}
            title={`${routePhrase(t.id)}: ${ok ? "passed" : "failed"} the physics test`}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${watching === t.id
              ? "border-ink bg-ink text-panel" : "border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink"}`}>
            <span aria-hidden="true" className={`size-1.5 rounded-full ${ok ? "bg-good" : "bg-bad"}`} />
            Try {t.tried.index} · {routePhrase(t.id)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A run in the Lab: the MuJoCo picture beside the task in 3D, one line of counts, and the physics tries to watch.
 * Every stage, check and log line stays in one closed section underneath.
 */
export function LabRun({ kind, runId, events, run, busy, names, details }: LabRunProps) {
  const [view, setView] = useState<ScreenView>({ kind: "live" });
  const finished = run !== null && !busy;
  const pic = finished ? pictureFromRun(run) : pictureFromEvents(events);
  const stages = stageStates(kind, finished ? run.events : events);
  const active = stages.find((s) => s.state === "active");
  const tries = triesOf(pic);
  const watching = view.kind === "try" ? view.row.id : null;
  const shown: ScreenView = view.kind === "try" ? view : finished ? { kind: "final" } : { kind: "live" };
  const watch = (row: Tried) => setView({ kind: "try", row });
  const line = summary(pic, tries, busy);

  return (
    <div className="space-y-4">
      {busy && <RunProgress events={events} message={active && `Now: ${title(active.key, kind, names, pic).replace(/:.*/, "")}`} />}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <RunScreen runId={runId} run={run} busy={busy} view={shown} lastStatus={pic.lastStatus}
          hasTries={tries.length > 0} onBack={() => setView({ kind: "live" })} />
        {pic.task ? (
          <Scene3D start={pic.task.start} target={pic.task.target} obstacles={pic.task.obstacles} base={baseOf(pic.placement)}
            baseLabel={`${names.robot} base`} routes={sceneRoutes(pic)}
            label={`The task in 3D: ${count(pic.task.obstacles.length, "obstacle")}, the start, the target and ${count(pic.routes.length, "route")}.`} />
        ) : (
          <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-line-strong text-sm text-ink-3">
            The task appears here in 3D once it is set up.
          </div>
        )}
      </div>
      {line && <p className="text-sm text-ink-2">{line}</p>}
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
