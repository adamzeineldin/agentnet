"use client";

import Link from "next/link";
import { fmtDateTime, fmtM, fmtSec } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { ExperienceCapsule } from "@/lib/types";
import { Badge, ErrorNote, Loading, Panel, Stat } from "./ui";

function SkillCard({ c }: { c: ExperienceCapsule }) {
  const v = c.validation;
  return (
    <Panel title={<span className="font-mono normal-case">{c.skill_id}</span>} right={<Badge tone="good">✓ {c.status.replaceAll("_", " ")}</Badge>}>
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="accent">{c.strategy.route_class.replace("_", " ")} · clearance {fmtM(c.strategy.clearance_m, 0)}</Badge>
          <Badge>source {c.source_robot_id}</Badge>
          <Badge>{c.task.scene_id}</Badge>
          <Badge>schema v{c.schema_version}</Badge>
        </div>
        <p className="text-ink-2">{c.strategy.description}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Endpoint error" value={fmtM(v.endpoint_error_m, 2)} />
          <Stat label="Collisions" value={v.collisions} />
          <Stat label="Min clearance" value={fmtM(v.min_clearance_m, 1)} />
          <Stat label="Verified / tried" value={`${v.candidates_verified} / ${v.candidates_evaluated}`} />
        </div>
        <div>
          <div className="mb-1 text-[11px] tracking-wide text-ink-3 uppercase">Lineage</div>
          <div className="flex flex-wrap items-center gap-1 font-mono">
            {[...c.lineage, c.skill_id].map((id, i, arr) => (
              <span key={id} className="flex items-center gap-1">
                <span className={id === c.skill_id ? "text-ink" : "text-ink-3"}>{id}</span>
                {i < arr.length - 1 && <span className="text-ink-3">→</span>}
              </span>
            ))}
            {c.lineage.length === 0 && <span className="text-ink-3">(original — no parent)</span>}
          </div>
        </div>
        <details className="rounded-md border border-line px-3 py-2">
          <summary className="cursor-pointer text-ink-2">Candidate outcomes & provenance</summary>
          <table className="tabular mt-2 w-full font-mono text-[11px]">
            <tbody>
              {c.candidate_outcomes.map((o) => (
                <tr key={o.candidate_id} className="border-t border-line">
                  <td className="py-1 pr-2">{o.candidate_id}</td>
                  <td className={o.outcome === "verified" ? "text-good" : o.outcome === "feasible" || o.outcome === "not_simulated" ? "text-accent" : "text-bad"}>{o.outcome}</td>
                  <td className="pl-2 text-ink-3">{o.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-1 text-[11px]">
            {Object.entries(c.provenance).map(([k, val]) => (
              <div key={k} className="contents"><dt className="text-ink-3">{k}</dt><dd className="font-mono text-ink-2">{String(val)}</dd></div>
            ))}
            <dt className="text-ink-3">simulated</dt><dd className="font-mono text-ink-2">{fmtSec(v.simulated_seconds)}</dd>
            <dt className="text-ink-3">published</dt><dd className="font-mono text-ink-2">{fmtDateTime(c.created_at)}</dd>
          </dl>
        </details>
        <div className="flex items-center gap-3">
          <button disabled title="Cross-robot transfer is Milestone 3"
            className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 text-ink-3">Transfer to robot…</button>
          <span className="text-[11px] text-ink-3">available in Milestone 3</span>
        </div>
      </div>
    </Panel>
  );
}

export function SkillLibrary() {
  const skills = useApi<ExperienceCapsule[]>("/api/skills", 10000);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Skill Library</h1>
        <p className="mt-1 text-sm text-ink-2">
          Published Experience Capsules. Each stores task-frame geometry and strategy, never joint angles, plus the
          run that verified it in simulation.
        </p>
      </div>
      {skills.error && <ErrorNote message={skills.error} />}
      {skills.loading && <Loading />}
      {skills.data?.length === 0 && (
        <p className="text-sm text-ink-3">No published skills yet. <Link href="/transfer" className="text-accent">Discover one in the Transfer Lab →</Link></p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {skills.data?.map((c) => <SkillCard key={c.skill_id} c={c} />)}
      </div>
    </div>
  );
}
