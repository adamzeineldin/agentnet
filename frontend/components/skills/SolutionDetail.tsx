"use client";

import { fmtDateTime, fmtM, fmtSec } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { ExperienceCapsule, RunRecord } from "@/lib/types";
import { LineageGraph } from "../LineageGraph";
import { Term } from "../Term";
import { describeDiscover, describeTransfer } from "../transfer/describe";
import { RunVideo } from "../transfer/RunMedia";
import { Disclosure, ErrorNote, Loading, Stat } from "../ui";

/** One robot's saved solution: its video, a plain sentence, the proof and where it came from. */
export function SolutionDetail({ capsule, robotName }: { capsule: ExperienceCapsule; robotName: (id: string) => string }) {
  const run = useApi<RunRecord>(`/api/runs/${capsule.provenance.run_id}`);
  const v = capsule.validation;
  const me = robotName(capsule.source_robot_id);
  return (
    <div className="space-y-4 rounded-xl bg-panel-2/50 p-4">
      {run.error && <ErrorNote message={run.error} />}
      {!run.data ? <Loading label="Loading the recorded run…" /> : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <RunVideo run={run.data} busy={false} emptyLabel="No video for this run" />
          <div className="space-y-3">
            <p className="text-sm text-ink">
              {capsule.parent_skill_id
                ? describeTransfer(run.data, robotName(String(capsule.provenance.transferred_from_robot)), me)
                : describeDiscover(run.data, me)}
            </p>
            <div className="metric-grid grid grid-cols-3 [&_.stat-value]:text-[20px]">
              <Stat label={<Term id="endpointError">Distance from target</Term>} value={fmtM(v.endpoint_error_m, 1)} />
              <Stat label="Wall touches" value={v.collisions} />
              <Stat label="Routes that passed" value={`${v.candidates_verified} of ${v.candidates_evaluated}`} />
            </div>
          </div>
        </div>
      )}
      <div>
        <div className="mb-1 text-xs text-ink-3">Where it came from</div>
        <LineageGraph skillId={capsule.skill_id} />
      </div>
      <Disclosure summary="The saved record" hint={capsule.skill_id}>
        <table className="tabular w-full font-mono text-[11px]">
          <tbody>
            {capsule.candidate_outcomes.map((o) => (
              <tr key={o.candidate_id} className="border-t border-line">
                <td className="py-1 pr-2">{o.candidate_id}</td>
                <td className={o.outcome === "verified" ? "text-good" : o.outcome === "feasible" || o.outcome === "not_simulated" ? "text-accent" : "text-bad"}>{o.outcome}</td>
                <td className="pl-2 text-ink-3">{o.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-1 text-[11px]">
          {Object.entries(capsule.provenance).map(([k, val]) => (
            <div key={k} className="contents"><dt className="text-ink-3">{k}</dt><dd className="break-all font-mono text-ink-2">{String(val)}</dd></div>
          ))}
          <dt className="text-ink-3">simulated</dt><dd className="font-mono text-ink-2">{fmtSec(v.simulated_seconds)}</dd>
          <dt className="text-ink-3">saved</dt><dd className="font-mono text-ink-2">{fmtDateTime(capsule.created_at)}</dd>
        </dl>
      </Disclosure>
    </div>
  );
}
