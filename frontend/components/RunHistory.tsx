"use client";

import { useState } from "react";
import { fmtDateTime, fmtM, fmtSec } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { RunRecord } from "@/lib/types";
import { EventLog, RunEvidence } from "./RunEvidence";
import { ErrorNote, Loading, Panel, StatusBadge } from "./ui";

export function RunHistory() {
  const runs = useApi<RunRecord[]>("/api/runs?limit=200", 5000);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = runs.data?.find((r) => r.run_id === openId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Run History</h1>
        <p className="mt-1 text-sm text-ink-2">Every simulated job recorded by the backend, including failures.</p>
      </div>
      {runs.error && <ErrorNote message={runs.error} />}
      {runs.loading && <Loading />}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_32rem]">
        <Panel title={`Runs (${runs.data?.length ?? 0})`}>
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[720px] text-xs">
              <thead>
                <tr className="text-left text-[11px] tracking-wide text-ink-3 uppercase">
                  {["Run", "Type", "Robot", "Planner", "Seed", "Status", "Error", "Collisions", "Sim time", "Started"].map((h) => (
                    <th key={h} className="pb-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.data?.map((r) => (
                  <tr key={r.run_id} onClick={() => setOpenId(r.run_id)}
                    className={`cursor-pointer border-t border-line hover:bg-panel-2 ${r.run_id === openId ? "bg-panel-2" : ""}`}>
                    <td className="py-2 font-mono text-ink-2">{r.run_id.slice(-6)}</td>
                    <td>{r.run_type.replace("_", " ")}</td>
                    <td>{r.target_robot_id ? `${r.source_robot_id} → ${r.target_robot_id}` : r.source_robot_id}</td>
                    <td className="text-ink-2">{r.planner}</td>
                    <td>{r.task_seed}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{fmtM(r.endpoint_error_m, 2)}</td>
                    <td>{r.collision_count ?? "—"}</td>
                    <td>{fmtSec(r.simulated_seconds)}</td>
                    <td className="text-ink-3">{fmtDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {runs.data?.length === 0 && <p className="py-6 text-center text-xs text-ink-3">No runs yet.</p>}
          </div>
        </Panel>
        {open && (
          <Panel title="Run evidence" right={<button onClick={() => setOpenId(null)} className="text-xs text-ink-3 hover:text-ink">close ✕</button>}>
            <RunEvidence run={open} />
            <div className="mt-4 border-t border-line pt-3"><EventLog events={open.events} /></div>
          </Panel>
        )}
      </div>
    </div>
  );
}
