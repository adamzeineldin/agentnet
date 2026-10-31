"use client";

import { useState } from "react";
import { LineageGraph } from "./LineageGraph";
import { MemoryGraph } from "./MemoryGraph";
import { LibrarianPanel } from "./library/LibrarianPanel";
import Link from "next/link";
import { fmtDateTime, fmtM, fmtSec } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { ExperienceCapsule, RobotSummary } from "@/lib/types";
import { skillName } from "./transfer/skillName";
import { Term } from "./Term";
import { Badge, Disclosure, ErrorNote, Loading, PageHeader, Panel, Stat } from "./ui";

function SkillDetail({ c, robotName }: { c: ExperienceCapsule; robotName: (id: string) => string }) {
  const v = c.validation;
  return (
    <Panel title={<span title={c.skill_id}>{skillName(c)}</span>} right={<Badge tone="good">✓ passed in simulation</Badge>}>
      <div className="space-y-6 text-xs">
        <div>
          <p className="eyebrow">{c.parent_skill_id ? `Adapted by the ${robotName(c.source_robot_id)}` : `Learned by the ${robotName(c.source_robot_id)}`}</p>
          <p className="mt-3 text-base text-ink-2">{c.strategy.description}</p>
        </div>
        <div className="metric-grid grid grid-cols-3">
          <Stat label={<Term id="endpointError">Endpoint error</Term>} value={fmtM(v.endpoint_error_m, 2)} hint={`limit ${fmtM(v.tolerance_m, 0)}`} />
          <Stat label="Wall touches" value={v.collisions} />
          <Stat label="Routes that passed" value={`${v.candidates_verified} of ${v.candidates_evaluated}`} />
        </div>
        <div>
          <div className="mb-1 text-[11px] tracking-wide text-ink-3 uppercase">Family tree</div>
          <LineageGraph skillId={c.skill_id} />
        </div>
        <Disclosure summary="Every route tried, and the raw record" hint={c.skill_id}>
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
        </Disclosure>
        <Link href={`/transfer?source=${c.source_robot_id}&skill=${encodeURIComponent(c.skill_id)}`} className="button-primary">
          Teach this to another arm →
        </Link>
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
  const robotName = (id: string) => robots.data?.find((r) => r.robot_id === id)?.short_name ?? id;
  const visible = skills.data?.filter((c) => `${c.skill_id} ${c.goal} ${c.source_robot_id} ${c.strategy.route_class}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const current = visible.find((c) => c.skill_id === selected) ?? visible[0];
  return <div className="space-y-6">
    <PageHeader eyebrow="Shared experience" title="Skills" guide="steps" here="/skills" actions={
      <div className="segmented" role="tablist" aria-label="Library view">
        <button role="tab" aria-selected={view === "list"} onClick={() => setView("list")}>Skills</button>
        <button role="tab" aria-selected={view === "graph"} onClick={() => setView("graph")}>Memory graph</button>
        <button role="tab" aria-selected={view === "librarian"} onClick={() => setView("librarian")}>Librarian</button>
      </div>
    }>
      Every <Term id="skill">skill</Term> an arm has learned and passed its physics test with. Each keeps the task, the
      route that worked and the proof. The librarian tab tidies the collection and suggests what to teach next.
    </PageHeader>
    {skills.error && <ErrorNote message={skills.error} />}
    {skills.loading && <Loading />}
    {skills.data?.length === 0 && <p className="soft-card p-8 text-sm text-ink-3">No published skills yet. <Link href="/transfer" className="text-accent">Discover one in the Transfer Lab →</Link></p>}
    {view === "librarian" ? <LibrarianPanel onOpenSkill={(id) => { setSelected(id); setQuery(""); setView("list"); }} />
    : view === "graph" ? <>
      {robots.error && <ErrorNote message={robots.error} />}
      {skills.data && robots.data && <MemoryGraph skills={skills.data} robots={robots.data} onOpenSkill={(id) => { setSelected(id); setQuery(""); setView("list"); }} />}
    </> : skills.data && skills.data.length > 0 && <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="soft-card overflow-hidden">
        <div className="border-b border-line p-4"><input aria-label="Search shared memory" placeholder="Search shared memory…" value={query}
          onChange={(e) => setQuery(e.target.value)} className="w-full border border-line-strong bg-transparent px-3 py-2 text-sm" /></div>
        <div className="max-h-[650px] overflow-auto">
          {visible.map((c) => <button key={c.skill_id} aria-pressed={current?.skill_id === c.skill_id} onClick={() => setSelected(c.skill_id)}
            className={`block w-full border-b border-line border-l-2 p-4 text-left ${current?.skill_id === c.skill_id ? "border-l-accent bg-panel-2" : "border-l-transparent hover:bg-panel-2"}`}>
            <span className="text-sm font-medium">{skillName(c)}</span>
            <p className="mt-1 text-xs text-ink-3">{robotName(c.source_robot_id)} · {c.parent_skill_id ? "adapted from another arm" : "learned first-hand"}</p>
            <p className="sr-only">{c.skill_id}</p>
          </button>)}
        </div>
        {visible.length === 0 && <p className="p-4 text-sm text-ink-3">No skills match your search.</p>}
      </aside>
      {current && <SkillDetail c={current} robotName={robotName} />}
    </div>}
  </div>;
}
