"use client";

import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { TERMINAL } from "@/lib/types";
import { useState } from "react";
import { fmtDateTime, fmtM, fmtSec } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { CandidateSummary, ReasoningTrace, RunRecord } from "@/lib/types";
import { LineageGraph } from "./LineageGraph";
import { EventLog, RunEvidence } from "./RunEvidence";
import { ProviderBadge } from "./transfer/ImaginationPanel";
import { Badge, ErrorNote, Loading, PageHeader, Panel, StatusBadge } from "./ui";

const TYPES = ["all", "discover", "transfer", "real_replay", "motion_check"] as const;
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
        <RunEvidence run={run} split />
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
  const [status, setStatus] = useState("all");
  const visible = runs.data?.filter((r) => status === "all" || (status === "running" ? !TERMINAL.has(r.status) : r.status === status));
  const [openId, setOpenId] = useState<string | null>(null);
  const open = runs.data?.find((r) => r.run_id === openId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Simulation records" title="Run History" actions={
        <div className="flex gap-1 border border-line p-0.5 text-xs" role="tablist">
          {TYPES.map((t) => (
            <button key={t} role="tab" aria-selected={filter === t} onClick={() => setFilter(t)}
              className={` px-2.5 py-1 ${filter === t ? "bg-ink text-bg" : "text-ink-3 hover:text-ink"}`}>
              {t.replace("_", " ")}
            </button>
          ))}
        </div>
      }>
        Every simulation run, including the ones that failed. Open a run to see what happened, why, and its video.
      </PageHeader>
      {runs.error && <ErrorNote message={runs.error} />}
      {runs.loading && <Loading />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="segmented" role="tablist" aria-label="Run status">
          {["all", "running", "queued", "succeeded", "failed"].map((value) => <button key={value} role="tab"
            aria-selected={status === value} onClick={() => setStatus(value)}>{value === "all" ? "All statuses" : value}</button>)}
        </div>
        <Link href="/transfer" className="button-primary">New simulation</Link>
      </div>
      {open && <RunDetail run={open} onClose={() => setOpenId(null)} />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,270px),1fr))] gap-4">
        {visible?.map((r) => <button key={r.run_id} onClick={() => setOpenId(r.run_id)} aria-pressed={r.run_id === openId}
          aria-label={`Open ${r.run_type.replaceAll("_", " ")} ${r.run_id}`}
          className={`min-w-0 overflow-hidden border bg-panel text-left hover:border-ink ${r.run_id === openId ? "border-ink" : "border-line"}`}>
          <div className="relative aspect-video bg-panel-2">
            {r.artifacts.poster ?
              /* eslint-disable-next-line @next/next/no-img-element -- recorded MuJoCo artifact */
              <img src={apiUrl(r.artifacts.poster)} alt="Recorded simulation" className="size-full object-cover" /> :
              <div className="grid size-full place-items-center px-4 text-center text-xs text-ink-3">{TERMINAL.has(r.status) ? "No recorded preview" : "Simulation in progress"}</div>}
            <div className="absolute left-3 top-3 bg-panel px-2 py-1"><StatusBadge status={r.status} /></div>
            <span className="absolute bottom-3 right-3 bg-panel px-2 py-1 font-mono text-[10px]">{r.run_id.slice(-6)}</span>
          </div>
          <div className="space-y-3 p-4">
            <div><h2 className="text-base font-medium capitalize">{r.run_type.replaceAll("_", " ")}</h2>
              <p className="mt-1 truncate text-xs text-ink-3">{r.target_robot_id ? `${r.source_robot_id} → ${r.target_robot_id}` : r.source_robot_id ?? "Benchmark"}</p></div>
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs">
              <div><span className="text-ink-3">Endpoint error</span><p className="mt-1 font-mono">{fmtM(r.endpoint_error_m, 2)}</p></div>
              <div><span className="text-ink-3">Simulated time</span><p className="mt-1 font-mono">{fmtSec(r.simulated_seconds)}</p></div>
            </div>
            <p className="truncate font-mono text-[10px] text-ink-3">{r.planner}{r.model_used ? ` · ${r.model_used}` : ""} · seed {r.task_seed}</p>
            <p className="text-[11px] text-ink-3">{fmtDateTime(r.created_at)}</p>
          </div>
        </button>)}
      </div>
      {visible?.length === 0 && <p className="border border-line bg-panel p-8 text-center text-sm text-ink-3">No runs match these filters.</p>}
    </div>
  );
}
