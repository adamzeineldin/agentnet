"use client";

import { useState } from "react";
import Link from "next/link";
import type { ExperienceCapsule, RobotSummary } from "@/lib/types";
import { Panel } from "./ui";

type Node = { id: string; label: string; x: number; y: number; robot?: RobotSummary; skill?: ExperienceCapsule };

/** Only registry publications and recorded parent-child adaptations create edges. */
export function MemoryGraph({ skills, robots, onOpenSkill }: {
  skills: ExperienceCapsule[]; robots: RobotSummary[]; onOpenSkill: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const orbit = (i: number, count: number, rx: number, ry: number, phase = -Math.PI / 2) => {
    const angle = phase + i * Math.PI * 2 / Math.max(1, count);
    return { x: 450 + Math.cos(angle) * rx, y: 300 + Math.sin(angle) * ry };
  };
  const nodes: Node[] = [
    ...skills.map((skill, i) => ({ id: `s:${skill.skill_id}`, label: skill.skill_id, skill, ...orbit(i, skills.length, 165, 110) })),
    ...robots.map((robot, i) => ({ id: `r:${robot.robot_id}`, label: robot.short_name, robot, ...orbit(i, robots.length, 350, 225, -Math.PI / 4) })),
  ];
  const edges = skills.flatMap((s) => [
    { from: `s:${s.skill_id}`, to: `r:${s.source_robot_id}`, adopted: false },
    ...(s.parent_skill_id ? [{ from: `s:${s.parent_skill_id}`, to: `r:${s.source_robot_id}`, adopted: true }] : []),
  ]).filter((edge) => nodes.some((n) => n.id === edge.from) && nodes.some((n) => n.id === edge.to));
  const current = nodes.find((n) => n.id === selected);
  const connected = new Set([selected, ...edges.filter((e) => e.from === selected || e.to === selected).flatMap((e) => [e.from, e.to])]);
  const neighbors = nodes.filter((n) => n.id !== selected && connected.has(n.id));

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
    <Panel title="Shared memory" right={<span className="font-mono text-[11px] text-ink-3">registry lineage</span>}>
      <div className="relative">
        <svg viewBox="0 0 900 600" className="w-full" role="group" aria-label="Robot and skill memory graph">
          <ellipse cx="450" cy="300" rx="165" ry="110" fill="none" stroke="var(--line)" />
          <ellipse cx="450" cy="300" rx="350" ry="225" fill="none" stroke="var(--line)" />
          {edges.map((e, i) => {
            const a = nodes.find((n) => n.id === e.from)!;
            const b = nodes.find((n) => n.id === e.to)!;
            const active = e.from === selected || e.to === selected;
            return <line key={`${e.from}-${e.to}-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={active ? "var(--accent)" : "var(--line-strong)"} strokeDasharray={e.adopted ? "4 4" : undefined}
              opacity={selected && !active ? .35 : 1} />;
          })}
          {nodes.map((n) => {
            const adopters = new Set(skills.filter((s) => s.parent_skill_id === n.skill?.skill_id).map((s) => s.source_robot_id)).size;
            const active = n.id === selected;
            return <g key={n.id} role="button" tabIndex={0} aria-label={`Select ${n.label}`} aria-pressed={active}
              onClick={() => setSelected(n.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(n.id); } }}
              style={{ cursor: "pointer" }} opacity={selected && !connected.has(n.id) ? .35 : 1}>
              <circle cx={n.x} cy={n.y} r={24} fill="transparent" />
              <circle cx={n.x} cy={n.y} r={n.robot ? 12 : Math.min(26, 7 + 2.5 * adopters)}
                fill={n.robot ? "var(--panel)" : active ? "var(--accent)" : "var(--ink)"}
                stroke={active ? "var(--accent)" : "var(--ink)"} strokeWidth="1.5" />
              <text x={n.x} y={n.y + 35} textAnchor="middle" fill={active ? "var(--accent)" : "var(--ink-2)"}
                className="font-mono text-[11px]">{n.robot ? n.label : `${n.skill?.strategy.route_class} · ${n.skill?.skill_id.slice(-6)}`}</text>
              <title>{n.label}</title>
            </g>;
          })}
        </svg>
      </div>
      <p className="font-mono text-[11px] text-ink-3">Solid: published by robot · Dashed: parent skill adopted through a published adaptation</p>
    </Panel>
    <Panel title={current?.robot ? "Robot memory" : current?.skill ? "Skill memory" : "Explore memory"}>
      {!current ? <p className="text-sm text-ink-3">Select a robot or skill to inspect its recorded connections.</p> : <div className="space-y-5">
        <h3 className="break-words text-2xl font-light">{current.label}</h3>
        <p className="eyebrow">{current.robot ? "Published and adopted skills" : "Published by / adopted by"}</p>
        <ul className="divide-y divide-line">{neighbors.map((n) => <li key={n.id}><button className="w-full break-words py-3 text-left text-sm text-ink-2 hover:text-accent"
          onClick={() => setSelected(n.id)}>{n.label}</button></li>)}</ul>
        {neighbors.length === 0 && <p className="text-sm text-ink-3">No published connections yet.</p>}
        {current.skill && <button className="button-primary" onClick={() => onOpenSkill(current.skill!.skill_id)}>Open skill evidence</button>}
        {current.robot && <Link href={`/robots?robot=${current.robot.robot_id}`} className="button-secondary">Open robot passport</Link>}
      </div>}
    </Panel>
  </div>;
}
