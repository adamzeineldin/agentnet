"use client";

import { useState } from "react";
import type { CandidateSummary, RunEvent, RunRecord } from "@/lib/types";
import { RouteDiagram } from "../RouteDiagram";
import { RunProgress } from "../transfer/RunProgress";
import { pictureFromEvents, pictureFromRun, triesOf, type RouteRow, type RunPicture } from "./picture";
import { RunScreen, type ScreenView } from "./RunScreen";
import { RunSteps, title, type StepNames } from "./RunSteps";
import { stageStates, type RunKind } from "./stages";

interface RunViewerProps {
  kind: RunKind;
  runId: string | null;
  /** Progress events so far (live); ignored once `run` holds the finished record. */
  events: RunEvent[];
  run: RunRecord | null;
  busy: boolean;
  names: StepNames;
}

/** Routes as the route diagram draws them: unchecked ones faint, tried ones along MuJoCo's hand path. */
function mapCandidates(pic: RunPicture): { candidates: CandidateSummary[]; pending: Set<string> } {
  const outcome = (r: RouteRow) => r.tried?.outcome ?? (r.check ? (r.check.possible ? "feasible" : r.check.outcome) : "feasible");
  const candidates = pic.routes.map((r): CandidateSummary => ({
    candidate_id: r.id, route_class: r.routeClass, clearance_m: r.clearanceM, stage_reached: "", outcome: outcome(r),
    reason: r.check?.reason ?? "", waypoints_task: r.waypoints, joint_path_length_rad: null, ee_path_length_m: null,
    min_clearance_m: null, contacts: [], cost: null,
    physics: r.tried?.trace?.length ? { endpoint_error_m: r.tried.endpointErrorM ?? 0, simulated_seconds: 0, collisions: [], checks: {}, trace_task: r.tried.trace } : null,
  }));
  return { candidates, pending: new Set(pic.routes.filter((r) => !r.check).map((r) => r.id)) };
}

/**
 * One run, watched as it happens: the live MuJoCo picture, the stages with what each found, and the routes on a
 * map. When the run ends the same view stays, now showing the recorded final run and a clip of every physics try.
 */
export function RunViewer({ kind, runId, events, run, busy, names }: RunViewerProps) {
  const [view, setView] = useState<ScreenView>({ kind: "live" });
  const finished = run !== null && !busy;
  const pic = finished ? pictureFromRun(run) : pictureFromEvents(events);
  const stageEvents = finished ? run.events : events;
  const { candidates, pending } = mapCandidates(pic);
  const watching = view.kind === "try" ? view.row.id : null;
  const shown: ScreenView = view.kind === "try" ? view : finished ? { kind: "final" } : { kind: "live" };
  const stages = stageStates(kind, stageEvents);
  const active = stages.find((s) => s.state === "active");

  return (
    <div className="space-y-4">
      {busy && <RunProgress events={events} message={active && `Now: ${title(active.key, kind, names, pic).replace(/:.*/, "")}`} />}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-4 lg:sticky lg:top-20">
          <RunScreen runId={runId} run={run} busy={busy} view={shown} lastStatus={pic.lastStatus}
            hasTries={triesOf(pic).length > 0} onBack={() => setView({ kind: "live" })} />
          {pic.task && candidates.length > 0 && (
            <div className="rounded-xl border border-line p-3">
              <p className="mb-2 text-xs text-ink-3">
                {busy ? "Every route, drawn as it is checked." : "Every route it considered."} Tried routes show the path the hand really took in MuJoCo.
              </p>
              <RouteDiagram plain task={pic.task} candidates={candidates} pendingIds={busy ? pending : undefined}
                selectedId={watching ?? pic.selected ?? null} />
            </div>
          )}
        </div>
        <RunSteps kind={kind} stages={stages} pic={pic} names={names} watching={watching}
          onWatch={(row) => setView({ kind: "try", row })} />
      </div>
    </div>
  );
}
