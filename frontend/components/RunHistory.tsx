"use client";

import { useState } from "react";
import { fmtDateTime, fmtM, fmtSec } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { CandidateSummary, ReasoningTrace, RunRecord } from "@/lib/types";
import { LineageGraph } from "./LineageGraph";
import { EventLog, RunEvidence } from "./RunEvidence";
import { ProviderBadge } from "./transfer/ImaginationPanel";
import { Badge, ErrorNote, Loading, Panel, StatusBadge } from "./ui";

const TYPES = ["all", "discover", "transfer", "motion_check"] as const;
type TypeFilter = (typeof TYPES)[number];

const reasoningOf = (r: RunRecord) => r.results.reasoning as ReasoningTrace | undefined;
const candidatesOf = (r: RunRecord) => (r.results.candidates ?? []) as CandidateSummary[];

function RunDetail({ run, onClose }: { run: RunRecord; onClose: () => void }) {
  const cands = candidatesOf(run);
  const published = run.results.published === true;
  const sourceSkill = run.results.source_skill_id as string | undefined;
  return (
    <Panel title="Run evidence" right={<button onClick={onClose} className="text-xs text-ink-3 hover:text-ink">close ✕</button>}>
      <div className="space-y-4">
        <RunEvidence run={run} />
        {run.run_type === "transfer" && <div className="flex flex-wrap gap-2"><ProviderBadge trace={reasoningOf(run)} />
          {run.model_used && <Badge tone="accent">model {run.model_used}</Badge>}</div>}
        {cands.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] tracking-wide text-ink-3 uppercase">Candidates ({cands.length})</div>
            <ul className="space-y-0.5 font-mono text-[11px]">
              {cands.map((c) => (
                <li key={c.candidate_id} className="flex justify-between gap-2">
                  <span>{c.prior_rank ? `#${c.prior_rank} ` : ""}{c.candidate_id}</span>
                  <span className={c.outcome === "verified" ? "text-good" : c.outcome === "feasible" || c.outcome === "not_simulated" ? "text-accent" : "text-bad"}>
                    {c.candidate_id === run.results.selected ? "★ " : ""}{c.outcome}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(run.skill_id || sourceSkill) && (
          <div>
            <div className="mb-1 text-[11px] tracking-wide text-ink-3 uppercase">Capsule provenance</div>
            {published && run.skill_id ? <LineageGraph skillId={run.skill_id} />
              : sourceSkill ? <LineageGraph skillId={sourceSkill} />
              : <p className="text-xs text-ink-3">Produced draft {run.skill_id} — not published.</p>}
          </div>
        )}
        <div className="border-t border-line pt-3"><EventLog events={run.events} /></div>
      </div>
    </Panel>
  );
}

export function RunHistory() {
  const [filter, setFilter] = useState<TypeFilter>("all");
  const runs = useApi<RunRecord[]>(`/api/runs?limit=200${filter === "all" ? "" : `&run_type=${filter}`}`, 5000);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = runs.data?.find((r) => r.run_id === openId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Run History</h1>
          <p className="mt-1 text-sm text-ink-2">Every simulated job recorded by the backend, including failures. Select a run for its evidence and replay.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line p-0.5 text-xs" role="tablist">
          {TYPES.map((t) => (
            <button key={t} role="tab" aria-selected={filter === t} onClick={() => setFilter(t)}
              className={`rounded-md px-2.5 py-1 ${filter === t ? "bg-panel-2 text-ink" : "text-ink-3 hover:text-ink"}`}>
              {t.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>
      {runs.error && <ErrorNote message={runs.error} />}
      {runs.loading && <Loading />}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_34rem]">
        <Panel title={`Runs (${runs.data?.length ?? 0})`}>
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[900px] text-xs">
              <thead>
                <tr className="text-left text-[11px] tracking-wide text-ink-3 uppercase">
                  {["Run", "Type", "Robots", "Skill", "Planner · model", "Seed", "Cands", "Status", "Error", "Contacts", "Sim", "Started"].map((h) => (
                    <th key={h} className="pb-2 pr-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.data?.map((r) => (
                  <tr key={r.run_id} onClick={() => setOpenId(r.run_id)}
                    className={`cursor-pointer border-t border-line hover:bg-panel-2 ${r.run_id === openId ? "bg-panel-2" : ""}`}>
                    <td className="py-2 pr-2 font-mono text-ink-2">{r.run_id.slice(-6)}</td>
                    <td className="pr-2">{r.run_type.replace("_", " ")}</td>
                    <td className="pr-2">{r.target_robot_id ? `${r.source_robot_id} → ${r.target_robot_id}` : r.source_robot_id}</td>
                    <td className="max-w-[10rem] truncate pr-2 font-mono text-ink-2" title={r.skill_id ?? ""}>{r.skill_id ?? "—"}</td>
                    <td className="pr-2 text-ink-2">{r.planner}{r.model_used ? ` · ${r.model_used}` : ""}</td>
                    <td className="pr-2">{r.task_seed}</td>
                    <td className="pr-2">{candidatesOf(r).length || "—"}</td>
                    <td className="pr-2"><StatusBadge status={r.status} /></td>
                    <td className="pr-2">{fmtM(r.endpoint_error_m, 2)}</td>
                    <td className="pr-2">{r.collision_count ?? "—"}</td>
                    <td className="pr-2">{fmtSec(r.simulated_seconds)}</td>
                    <td className="text-ink-3">{fmtDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {runs.data?.length === 0 && <p className="py-6 text-center text-xs text-ink-3">No runs of this type yet.</p>}
          </div>
        </Panel>
        {open && <RunDetail run={open} onClose={() => setOpenId(null)} />}
      </div>
    </div>
  );
}
