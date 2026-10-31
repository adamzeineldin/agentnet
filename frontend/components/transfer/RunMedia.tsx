import { apiUrl } from "@/lib/api";
import { fmtM, fmtSec } from "@/lib/format";
import type { RunRecord, SearchMetrics } from "@/lib/types";
import { Term } from "../Term";
import { Badge, Stat, StatusBadge } from "../ui";

interface RunVideoProps { run: RunRecord | null; busy: boolean; emptyLabel: string; rate?: number }

/** Recorded MuJoCo clip. `rate` slows playback for presentation and is always labelled on screen. */
export function RunVideo({ run, busy, emptyLabel, rate = 1 }: RunVideoProps) {
  if (run?.artifacts.video) {
    return (
      <div className="relative">
        <video key={run.artifacts.video} src={apiUrl(run.artifacts.video)}
          poster={run.artifacts.poster ? apiUrl(run.artifacts.poster) : undefined}
          onLoadedMetadata={(e) => { e.currentTarget.playbackRate = rate; }}
          controls autoPlay muted playsInline loop className="aspect-video w-full rounded-xl border border-line bg-black" />
        {rate !== 1 && (
          <span className="absolute top-2 right-2 bg-black/70 px-2 py-0.5 font-mono text-[11px] text-white/80">
            {rate}× speed · simulated time
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-line px-4 text-center text-xs text-ink-3">
      {busy ? "Searching and simulating in MuJoCo…" : run ? "No execution video (run did not reach execution)" : emptyLabel}
    </div>
  );
}

export function RunSummary({ run, live }: { run: RunRecord; live: boolean }) {
  const metrics = run.results.search_metrics as SearchMetrics | undefined;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={run.status} />
        <Badge tone={live ? "accent" : "neutral"}>{live ? "● just ran" : "recorded"}</Badge>
        <Badge>layout {run.task_seed}</Badge>
        <span className="font-mono text-[11px] text-ink-3" title={`${run.planner} · ${run.run_id}`}>{run.run_id.slice(-6)}</span>
      </div>
      <div className="metric-grid grid grid-cols-3 [&_.stat-value]:text-[22px]">
        <Stat label={<Term id="endpointError">Endpoint error</Term>} value={fmtM(run.endpoint_error_m, 2)} hint="limit 10 mm" />
        <Stat label="Wall touches" value={run.collision_count ?? "—"} />
        <Stat label="Physics tests" value={metrics ? metrics.physics_rollouts : "—"}
          hint={`took ${fmtSec(run.wall_clock_seconds)}`} />
      </div>
    </div>
  );
}
