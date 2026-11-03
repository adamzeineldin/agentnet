"use client";

import Link from "next/link";
import { useState } from "react";
import { apiUrl } from "@/lib/api";
import { fmtDateTime, fmtM, fmtSec } from "@/lib/format";
import { TERMINAL } from "@/lib/types";
import type { RobotSummary, RunRecord } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { RunDialog } from "./history/RunDialog";
import { RUN_KIND } from "./history/runKinds";
import { ErrorNote, Loading, PageHeader, StatusBadge } from "./ui";

const PAGE = 48;
const TYPES = ["all", ...Object.keys(RUN_KIND)] as const;
const STATUSES = [["all", "Any result"], ["running", "Running"], ["succeeded", "Passed"], ["failed", "Failed"]] as const;

function RunCard({ run, onOpen }: { run: RunRecord; onOpen: () => void }) {
  const kind = RUN_KIND[run.run_type]?.title ?? run.run_type.replaceAll("_", " ");
  return (
    <button onClick={onOpen} aria-label={`Open ${kind} ${run.run_id}`} className="soft-card min-w-0 overflow-hidden text-left">
      <div className="relative aspect-video bg-panel-2">
        {run.artifacts.poster ?
          /* eslint-disable-next-line @next/next/no-img-element -- recorded MuJoCo artifact */
          <img src={apiUrl(run.artifacts.poster)} alt="Last frame of the recorded run" className="size-full object-cover" /> :
          <div className="grid size-full place-items-center px-4 text-center text-xs text-ink-3">
            {!TERMINAL.has(run.status) ? "Running now: open it to watch live"
              : run.status === "failed" ? "Stopped before anything was recorded" : "This kind of run has no video"}
          </div>}
        <div className="absolute left-3 top-3 rounded-full bg-panel px-2.5 py-1"><StatusBadge status={run.status} /></div>
      </div>
      <div className="space-y-3 p-4">
        <div><h2 className="text-base font-medium">{kind}</h2>
          <p className="mt-1 truncate text-xs text-ink-3">{run.target_robot_id ? `${run.source_robot_id} → ${run.target_robot_id}` : run.source_robot_id ?? "all robots"} · layout {run.task_seed}</p></div>
        <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs">
          <div><span className="text-ink-3">Distance from target</span><p className="mt-1 font-mono">{fmtM(run.endpoint_error_m, 1)}</p></div>
          <div><span className="text-ink-3">Simulated time</span><p className="mt-1 font-mono">{fmtSec(run.simulated_seconds)}</p></div>
        </div>
        <p className="text-[11px] text-ink-3">{fmtDateTime(run.created_at)}{run.started_by && ` · started by ${run.started_by}`}</p>
      </div>
    </button>
  );
}

export function RunHistory() {
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [status, setStatus] = useState<(typeof STATUSES)[number][0]>("all");
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const query = `limit=${shown}&full=false${type === "all" ? "" : `&run_type=${type}`}${status === "all" ? "" : `&run_status=${status}`}`;
  const runs = useApi<RunRecord[]>(`/api/runs?${query}`, 5000);
  const robots = useApi<RobotSummary[]>("/api/robots");
  const more = (runs.data?.length ?? 0) >= shown;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Simulation records" title="Every run" actions={<Link href="/transfer" className="button-primary">New run</Link>}>
        Every simulation, including the ones that failed. Open one to see each step it took, watch every physics try,
        and read the evidence.
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3">
        <div className="segmented max-w-full overflow-x-auto" role="tablist" aria-label="Run type">
          {TYPES.map((t) => (
            <button key={t} role="tab" aria-selected={type === t} onClick={() => { setType(t); setShown(PAGE); }}>
              {t === "all" ? "All" : RUN_KIND[t].filter}
            </button>
          ))}
        </div>
        <div className="segmented" role="tablist" aria-label="Run result">
          {STATUSES.map(([value, label]) => <button key={value} role="tab" aria-selected={status === value}
            onClick={() => { setStatus(value); setShown(PAGE); }}>{label}</button>)}
        </div>
      </div>
      {runs.error && <ErrorNote message={runs.error} />}
      {runs.loading && !runs.data && <Loading />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,270px),1fr))] gap-4">
        {runs.data?.map((r) => <RunCard key={r.run_id} run={r} onOpen={() => setOpenId(r.run_id)} />)}
      </div>
      {runs.data?.length === 0 && <p className="soft-card p-8 text-center text-sm text-ink-3">No runs match these filters.</p>}
      {more && (
        <div className="text-center">
          <button onClick={() => setShown((n) => n + PAGE)} className="pill">Show {PAGE} more</button>
        </div>
      )}
      {openId && <RunDialog key={openId} runId={openId} robots={robots.data ?? []} onClose={() => setOpenId(null)} />}
    </div>
  );
}
