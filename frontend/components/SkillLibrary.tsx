"use client";

import { useState } from "react";
import { LineageGraph } from "./LineageGraph";
import { MemoryGraph } from "./MemoryGraph";
import Link from "next/link";
import { fmtDateTime, fmtM, fmtSec } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { ExperienceCapsule, RobotSummary } from "@/lib/types";
import { Badge, ErrorNote, Loading, Panel, Stat } from "./ui";

function SkillDetail({ c }: { c: ExperienceCapsule }) {
  const v = c.validation;
  return (
    <Panel title={<span className="break-all font-mono text-xs normal-case">{c.skill_id}</span>} right={<Badge tone="good">✓ {c.status.replaceAll("_", " ")}</Badge>}>
      <div className="space-y-6 text-xs">
        <div><p className="eyebrow">Skill · v{c.version}</p><h2 className="mt-3 text-4xl font-light tracking-tight">{c.goal}</h2></div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="accent">{c.strategy.route_class.replace("_", " ")} · clearance {fmtM(c.strategy.clearance_m, 0)}</Badge>
          <Badge>source {c.source_robot_id}</Badge>
          <Badge>{c.task.scene_id}</Badge>
          <Badge>schema v{c.schema_version}</Badge>
        </div>
        <p className="text-ink-2">{c.strategy.description}</p>
        <div className="metric-grid grid grid-cols-2 sm:grid-cols-4">
          <Stat label="Endpoint error" value={fmtM(v.endpoint_error_m, 2)} />
          <Stat label="Collisions" value={v.collisions} />
          <Stat label="Min clearance" value={fmtM(v.min_clearance_m, 1)} />
          <Stat label="Verified / tried" value={`${v.candidates_verified} / ${v.candidates_evaluated}`} />
        </div>
        <div>
          <div className="mb-1 text-[11px] tracking-wide text-ink-3 uppercase">Lineage</div>
          <LineageGraph skillId={c.skill_id} />
        </div>
        <details className="border border-line px-3 py-2">
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
        {c.parent_skill_id === null && (
          <Link href={`/transfer?skill=${encodeURIComponent(c.skill_id)}`}
            className="inline-block border border-accent-dim bg-accent/10 px-3 py-1.5 text-accent hover:bg-accent/20">
            Transfer to robot… →
          </Link>
        )}
        {c.parent_skill_id && (
          <p className="text-[11px] text-ink-3">
            Adapted from <span className="font-mono">{c.parent_skill_id}</span> ({String(c.provenance.transferred_from_robot)}) ·
            source strategy {String(c.provenance.source_strategy)} ·{" "}
            {c.provenance.strategy_preserved ? "strategy preserved" : "strategy adapted"}
          </p>
        )}
      </div>
    </Panel>
  );
}

export function SkillLibrary() {
  const skills = useApi<ExperienceCapsule[]>("/api/skills", 10000);
  const robots = useApi<RobotSummary[]>("/api/robots");
  const [view, setView] = useState("list");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const visible = skills.data?.filter((c) => `${c.skill_id} ${c.goal} ${c.source_robot_id} ${c.strategy.route_class}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const current = visible.find((c) => c.skill_id === selected) ?? visible[0];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow mb-2">Shared experience</p><h1 className="text-[28px] font-normal tracking-[-0.02em]">Skill Library</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">Published, simulation-verified experience. Capsules carry task intent and geometry; target robots solve their own joint paths.</p></div>
      <div className="segmented" role="tablist" aria-label="Library view">
        <button role="tab" aria-selected={view === "list"} onClick={() => setView("list")}>Skills</button>
        <button role="tab" aria-selected={view === "graph"} onClick={() => setView("graph")}>Memory graph</button>
      </div>
    </div>
    {skills.error && <ErrorNote message={skills.error} />}
    {skills.loading && <Loading />}
    {skills.data?.length === 0 && <p className="border border-line bg-panel p-8 text-sm text-ink-3">No published skills yet. <Link href="/transfer" className="text-accent">Discover one in the Transfer Lab →</Link></p>}
    {view === "graph" ? <>
      {robots.error && <ErrorNote message={robots.error} />}
      {skills.data && robots.data && <MemoryGraph skills={skills.data} robots={robots.data} onOpenSkill={(id) => { setSelected(id); setQuery(""); setView("list"); }} />}
    </> : skills.data && skills.data.length > 0 && <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="border border-line bg-panel">
        <div className="border-b border-line p-4"><input aria-label="Search shared memory" placeholder="Search shared memory…" value={query}
          onChange={(e) => setQuery(e.target.value)} className="w-full border border-line-strong bg-transparent px-3 py-2 text-sm" /></div>
        <div className="max-h-[650px] overflow-auto">
          {visible.map((c) => <button key={c.skill_id} aria-pressed={current?.skill_id === c.skill_id} onClick={() => setSelected(c.skill_id)}
            className={`block w-full border-b border-line border-l-2 p-4 text-left ${current?.skill_id === c.skill_id ? "border-l-accent bg-panel-2" : "border-l-transparent hover:bg-panel-2"}`}>
            <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium">{c.strategy.route_class.replaceAll("_", " ")}</span><span className="font-mono text-[11px] text-ink-3">v{c.version}</span></div>
            <p className="mt-2 break-all font-mono text-[10px] text-ink-3">{c.skill_id}</p>
            <p className="mt-1 text-xs text-ink-3">{c.source_robot_id} · {c.parent_skill_id ? "adaptation" : "original"}</p>
          </button>)}
        </div>
        {visible.length === 0 && <p className="p-4 text-sm text-ink-3">No skills match your search.</p>}
      </aside>
      {current && <SkillDetail c={current} />}
    </div>}
  </div>;
}
