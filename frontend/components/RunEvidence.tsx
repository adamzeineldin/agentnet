import { apiUrl } from "@/lib/api";
import { fmtM, fmtRad, fmtSec, fmtTime } from "@/lib/format";
import type { RunEvent, RunRecord } from "@/lib/types";
import { Badge, Stat, StatusBadge } from "./ui";

export function EventLog({ events }: { events: RunEvent[] }) {
  return (
    <ol className="max-h-56 space-y-1 overflow-y-auto font-mono text-[11px]">
      {events.map((e, i) => (
        <li key={i} className="grid grid-cols-[4.5rem_5.5rem_1fr] gap-2">
          <span className="text-ink-3">{fmtTime(e.at)}</span>
          <span className={e.status === "failed" ? "text-bad" : e.status === "succeeded" ? "text-good" : "text-accent"}>
            {e.status}
          </span>
          <span className="text-ink-2">{e.message}</span>
        </li>
      ))}
    </ol>
  );
}

type Checks = Record<string, boolean>;
interface Jog { joint: string; commanded_rad: number; achieved_rad: number }

/** Everything shown here is read from the stored run record. */
export function RunEvidence({ run, split = false }: { run: RunRecord; split?: boolean }) {
  const checks = (run.results.checks ?? {}) as Checks;
  const jog = run.results.jog as Jog | undefined;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={run.status} />
        <Badge>{run.simulator}</Badge>
        <Badge>seed {run.task_seed}</Badge>
        <Badge>planner: {run.planner}</Badge>
        <span className="font-mono text-[11px] text-ink-3">{run.run_id}</span>
      </div>
      <div className={split ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" : "space-y-4"}>
      {run.artifacts.video ? (
        <video key={run.artifacts.video} src={apiUrl(run.artifacts.video)} poster={run.artifacts.poster ? apiUrl(run.artifacts.poster) : undefined}
          controls autoPlay muted playsInline className="aspect-video w-full border border-line bg-black" />
      ) : split ? <div className="grid aspect-video place-items-center border border-line bg-panel-2 text-sm text-ink-3">No execution video for this run.</div> : null}
      <div className="min-w-0 space-y-4">
      <div className={`metric-grid grid grid-cols-2 ${split ? "" : "sm:grid-cols-4"}`}>
        <Stat label="Endpoint error" value={fmtM(run.endpoint_error_m, 2)} />
        <Stat label="Collisions" value={run.collision_count ?? "—"} />
        <Stat label="Simulated" value={fmtSec(run.simulated_seconds)} />
        <Stat label="Wall clock" value={fmtSec(run.wall_clock_seconds)} />
      </div>
      {jog && (
        <p className="text-xs text-ink-2">
          Joint jog <span className="font-mono">{jog.joint}</span>: commanded {fmtRad(jog.commanded_rad)} rad,
          measured {fmtRad(jog.achieved_rad)} rad in simulation.
        </p>
      )}
      {Object.keys(checks).length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {Object.entries(checks).map(([k, ok]) => (
            <li key={k}><Badge tone={ok ? "good" : "bad"}>{ok ? "✓" : "✕"} {k.replaceAll("_", " ")}</Badge></li>
          ))}
        </ul>
      )}
      {run.error && <p className="text-xs text-bad">Error: {run.error}</p>}
      </div>
      </div>
    </div>
  );
}
