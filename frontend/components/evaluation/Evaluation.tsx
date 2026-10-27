"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { fmtDateTime, fmtM } from "@/lib/format";
import { useRunStream } from "@/lib/useRunStream";
import type { BenchmarkResults, RunRecord, Variant } from "@/lib/types";
import { EventLog } from "../RunEvidence";
import { Badge, ErrorNote, Loading, Panel, StatusBadge } from "../ui";
import { EvalStrip } from "./EvalStrip";

const VARIANTS: Variant[] = ["baseline_no_sharing", "retarget_only", "agentnet_offline"];

/** Sentences generated from the stored numbers only. */
function findings(res: BenchmarkResults): string[] {
  const all = res.summary;
  const out: string[] = [];
  const s = (v: Variant) => all[v].common;
  out.push(`Success on the ${s("agentnet_offline").applicable} comparable held-out scenes: ` +
    VARIANTS.map((v) => `${v} ${s(v).successes}/${s(v).applicable}`).join(", ") + ".");
  const p = res.paired?.agentnet_offline;
  if (p) {
    out.push(`Per scene vs no sharing, AgentNet needed fewer kinematic evaluations on ${p.fewer_kinematic_evals}, ` +
      `the same on ${p.same_kinematic_evals}, and more on ${p.more_kinematic_evals} of ${p.both_succeeded} scenes both solved; ` +
      `it solved ${p.only_variant} scene(s) the baseline missed and missed ${p.only_baseline} the baseline solved.`);
  }
  const families = Object.keys(all.agentnet_offline).filter((k) => k !== "all" && k !== "common");
  for (const f of families) {
    const a = all.agentnet_offline[f].median_kinematic_evaluations;
    const b = all.baseline_no_sharing[f].median_kinematic_evaluations;
    if (a != null && b != null) {
      out.push(`${f}: median kinematic evaluations ${a} (AgentNet) vs ${b} (no sharing)` +
        (a > b ? " — sharing hurt here." : a < b ? " — sharing helped here." : " — no difference."));
    }
  }
  const r = res.paired?.retarget_only;
  if (r) out.push(`Simple retargeting failed on ${r.only_baseline} scene(s) that a from-scratch search solved.`);
  return out;
}

export function Evaluation() {
  const stream = useRunStream();
  const [subset, setSubset] = useState("common");
  const [loadError, setLoadError] = useState<string | null>(null);
  const { load } = stream;

  useEffect(() => {
    apiFetch<RunRecord[]>("/api/benchmarks?limit=1")
      .then(([latest]) => latest && load(latest.run_id))
      .catch((e: Error) => setLoadError(e.message));
  }, [load]);

  const run = stream.run;
  const res = run?.status === "succeeded" ? (run.results as unknown as BenchmarkResults) : null;
  const subsets = res ? Object.keys(res.summary.baseline_no_sharing) : [];
  const rows = res ? res.rows.filter((r) => subset === "all" || subset === "common" || r.family === subset) : [];
  const common = new Set(res ? res.rows.map((r) => r.scene_id).filter((sid) =>
    res.rows.filter((r) => r.scene_id === sid).every((r) => r.applicable)) : []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Evaluation</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            Held-out scenes, matched budgets, every row from MuJoCo. The source robot builds a dev library; the target
            robot is evaluated on unseen seeds with and without that shared experience. Failures and losses are shown.
          </p>
        </div>
        <button onClick={() => void stream.start(() => apiFetch<RunRecord>("/api/benchmarks", { method: "POST", body: "{}" }))}
          disabled={stream.busy}
          className="rounded-md border border-accent-dim bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-50">
          {stream.busy ? "Running benchmark…" : "Run benchmark"}
        </button>
      </div>
      {(loadError || stream.error) && <ErrorNote message={(loadError || stream.error)!} />}
      {stream.busy && <Panel title="Progress"><EventLog events={stream.events} /></Panel>}
      {!run && !stream.busy && <Loading label="No benchmark recorded yet — run one." />}
      {run && run.status === "failed" && <ErrorNote message={`Benchmark ${run.run_id} failed: ${run.error ?? run.events.at(-1)?.message}`} />}

      {res && run && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge status={run.status} />
            <Badge>{stream.live ? "● live run" : "recorded run"} {run.run_id}</Badge>
            <Badge>{fmtDateTime(run.created_at)}</Badge><Badge>{run.simulator}</Badge>
            <Badge>{res.protocol.source_robot_id as string} library → {res.protocol.target_robot_id as string} evaluated</Badge>
          </div>
          <Panel title="Findings (generated from this run)">
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
              {findings(res).map((f) => <li key={f}>{f}</li>)}
            </ul>
          </Panel>
          <Panel title="Summary" right={
            <div className="flex gap-1 text-xs" role="tablist">
              {subsets.map((s) => (
                <button key={s} role="tab" aria-selected={subset === s} onClick={() => setSubset(s)}
                  className={`rounded-md px-2 py-1 ${subset === s ? "bg-panel-2 text-ink" : "text-ink-3 hover:text-ink"}`}>{s}</button>
              ))}
            </div>
          }>
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[760px] text-sm">
                <thead><tr className="text-left text-[11px] tracking-wide text-ink-3 uppercase">
                  {["Variant", "Success", "Med. kin. evals", "Med. rollouts to 1st ✓", "Med. error", "Med. wall time", "Sim steps", "Contacts", "API calls"].map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}
                </tr></thead>
                <tbody>
                  {VARIANTS.map((v) => {
                    const s = res.summary[v][subset];
                    return (
                      <tr key={v} className="border-t border-line">
                        <td className="py-2"><div className="font-mono">{v}</div><div className="text-[11px] text-ink-3">{res.protocol.variants[v]}</div></td>
                        <td>{s.successes}/{s.applicable} {s.success_rate != null && <span className="text-ink-3">({Math.round(s.success_rate * 100)}%)</span>}</td>
                        <td>{s.median_kinematic_evaluations ?? "—"}</td>
                        <td>{s.median_rollouts_to_first_success ?? "—"}</td>
                        <td>{fmtM(s.median_endpoint_error_m, 2)}</td>
                        <td>{s.median_wall_time_s == null ? "—" : `${s.median_wall_time_s.toFixed(3)} s`}</td>
                        <td>{s.total_sim_steps}</td><td>{s.collisions_in_rollouts}</td><td>{s.api_calls}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-5"><EvalStrip rows={subset === "common" ? rows.filter((r) => common.has(r.scene_id)) : rows} variants={VARIANTS} /></div>
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Protocol">
              <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-xs">
                {Object.entries(res.protocol).filter(([k]) => k !== "variants").map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-ink-3">{k.replaceAll("_", " ")}</dt>
                    <dd className="text-ink-2">{Array.isArray(v) ? (v.length > 6 ? `${v[0]}…${v.at(-1)} (${v.length})` : v.join(", ")) : String(v)}</dd></div>
                ))}
              </dl>
            </Panel>
            <Panel title={`Dev library (${res.dev_library.filter((d) => d.success).length}/${res.dev_library.length} verified)`}>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
                {res.dev_library.map((d) => (
                  <li key={d.scene_id} className="flex justify-between gap-2">
                    <span className="text-ink-3">{d.scene_id}</span>
                    <span className={d.success ? "text-good" : "text-bad"}>{d.strategy ?? "✕ none"}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
          <Panel title={`Raw rows (${res.rows.length})`}>
            <div className="max-h-[28rem] overflow-auto">
              <table className="tabular w-full min-w-[820px] text-xs">
                <thead className="sticky top-0 bg-panel"><tr className="text-left text-[11px] text-ink-3 uppercase">
                  {["Scene", "Variant", "Result", "Selected", "Kin. evals", "Rollouts", "Error", "Source strategy", "Note"].map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}
                </tr></thead>
                <tbody>
                  {res.rows.map((r) => (
                    <tr key={`${r.scene_id}-${r.variant}`} className="border-t border-line">
                      <td className="py-1 font-mono">{r.scene_id}</td><td className="font-mono">{r.variant}</td>
                      <td>{!r.applicable ? <Badge>n/a</Badge> : r.success ? <Badge tone="good">✓</Badge> : <Badge tone="bad">✕</Badge>}</td>
                      <td className="font-mono">{r.selected ?? "—"}</td><td>{r.kinematic_evaluations}</td><td>{r.physics_rollouts}</td>
                      <td>{fmtM(r.endpoint_error_m, 2)}</td><td className="font-mono">{r.source_strategy ?? "—"}</td>
                      <td className="text-ink-3">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
