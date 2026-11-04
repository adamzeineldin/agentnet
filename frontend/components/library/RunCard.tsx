import { apiUrl } from "@/lib/api";
import { fmtDateTime, fmtM, fmtSec } from "@/lib/format";
import { TERMINAL, type RunRecord } from "@/lib/types";
import { RUN_KIND } from "../history/runKinds";
import { StatusBadge } from "../ui";

interface RunCardProps {
  run: RunRecord;
  /** Robot id → short name. */
  name: (id: string) => string;
  /** Scene id → "Reach past a wall · layout 7". */
  layoutName: (sceneId: string) => string;
  onOpen: () => void;
}

/** "Panda → UR5e", "Panda" or "all robots", by short name; a replay has no source robot. */
export function robotsLabel(run: RunRecord, name: (id: string) => string): string {
  const ids = [run.source_robot_id, run.target_robot_id].filter((id): id is string => !!id);
  return ids.length ? ids.map(name).join(" → ") : "all robots";
}

export function runKindTitle(run: RunRecord): string {
  return RUN_KIND[run.run_type]?.title ?? run.run_type.replaceAll("_", " ");
}

/** One stored run: its last frame, what it was, on which task, and the numbers that decide pass or fail. */
export function RunCard({ run, name, layoutName, onOpen }: RunCardProps) {
  const kind = runKindTitle(run);
  const scene = run.results.scene_id as string | undefined;
  return (
    <button onClick={onOpen} aria-label={`Open ${kind} ${run.run_id}`} className="soft-card min-w-0 overflow-hidden text-left">
      <div className="relative aspect-video bg-panel-2">
        {run.artifacts.poster ?
          /* eslint-disable-next-line @next/next/no-img-element -- recorded MuJoCo artifact */
          <img src={apiUrl(run.artifacts.poster)} alt="Last frame of the recorded run" className="size-full object-cover" /> :
          <div className="grid size-full place-items-center px-4 text-center text-xs text-ink-3">
            {!TERMINAL.has(run.status) ? "▶ Running now"
              : run.status === "failed" ? "Stopped before recording" : "No video"}
          </div>}
        <div className="absolute left-3 top-3 rounded-full bg-panel px-2.5 py-1"><StatusBadge status={run.status} /></div>
        {run.results.published === true && (
          <span className="absolute right-3 top-3 rounded-full bg-good px-2.5 py-1 text-[11px] text-bg">saved as a skill</span>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div>
          <h2 className="text-base font-medium">{kind}</h2>
          <p className="truncate text-xs text-ink-2">{robotsLabel(run, name)}{scene && <span className="text-ink-3"> · {layoutName(scene)}</span>}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 font-mono text-[11px] text-ink-2">
          {run.endpoint_error_m != null && <span title="Distance from target" className="rounded-full bg-panel-2 px-2 py-0.5">◎ {fmtM(run.endpoint_error_m, 1)}</span>}
          {run.simulated_seconds != null && <span title="Simulated time" className="rounded-full bg-panel-2 px-2 py-0.5">⏱ {fmtSec(run.simulated_seconds)}</span>}
          {!scene && <span title="Layout number" className="rounded-full bg-panel-2 px-2 py-0.5">#{run.task_seed}</span>}
        </div>
        <p className="text-[11px] text-ink-3">{fmtDateTime(run.created_at)}{run.started_by && ` · ${run.started_by}`}</p>
      </div>
    </button>
  );
}
