"use client";

import { useApi } from "@/lib/useApi";
import type { ExperienceCapsule, SkillDetail } from "@/lib/types";
import { Loading } from "./ui";

function Node({ c, current }: { c: ExperienceCapsule; current: boolean }) {
  return (
    <div className={` border px-2.5 py-1.5 ${current ? "border-good/60 bg-good/5" : "border-line bg-panel-2"}`}>
      <div className="font-mono text-[11px] text-ink">{c.skill_id}</div>
      <div className="text-[10px] text-ink-3">{c.source_robot_id} · {c.strategy.route_class}@{c.strategy.clearance_m.toFixed(2)}</div>
    </div>
  );
}

/** Provenance chain from the registry: ancestors → this capsule → children. */
export function LineageGraph({ skillId }: { skillId: string }) {
  const { data, error, loading } = useApi<SkillDetail>(`/api/skills/${skillId}`);
  if (loading) return <Loading label="Loading lineage…" />;
  if (error || !data) return <p className="text-xs text-ink-3">Capsule {skillId} is not published (draft only).</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {data.ancestors.map((a) => (
        <span key={a.skill_id} className="flex items-center gap-2"><Node c={a} current={false} /><span className="text-accent">→</span></span>
      ))}
      <Node c={data.capsule} current />
      {data.children.length > 0 && <span className="text-accent">→</span>}
      <div className="flex flex-col gap-1">
        {data.children.map((c) => <Node key={c.skill_id} c={c} current={false} />)}
      </div>
    </div>
  );
}
