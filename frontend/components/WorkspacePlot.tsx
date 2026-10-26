"use client";

import { useState } from "react";
import type { WorkspaceEstimate } from "@/lib/types";

const SIZE = 280;
const PAD = 26;

/** Top-down (x-y) view of sampled, collision-free end-effector positions. */
export function WorkspacePlot({ workspace, label }: { workspace: WorkspaceEstimate; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const extent = Math.ceil(workspace.max_reach_m * 10) / 10 + 0.1;
  const scale = (SIZE - 2 * PAD) / (2 * extent);
  const sx = (x: number) => SIZE / 2 + x * scale;
  const sy = (y: number) => SIZE / 2 - y * scale;
  const ticks = [-extent + 0.1, 0, extent - 0.1].map((t) => Math.round(t * 10) / 10);
  const p = hover === null ? null : workspace.points[hover];

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[320px]" role="img"
        aria-label={`${label}: top-down view of ${workspace.points.length} sampled reachable end-effector positions`}>
        <rect x={PAD} y={PAD} width={SIZE - 2 * PAD} height={SIZE - 2 * PAD} fill="none" stroke="var(--line)" />
        {ticks.map((t) => (
          <g key={t} className="text-[9px]" fill="var(--ink-3)">
            <line x1={sx(t)} x2={sx(t)} y1={PAD} y2={SIZE - PAD} stroke="var(--line)" strokeDasharray="2 4" />
            <line y1={sy(t)} y2={sy(t)} x1={PAD} x2={SIZE - PAD} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={sx(t)} y={SIZE - PAD + 12} textAnchor="middle">{t.toFixed(1)}</text>
            <text x={PAD - 4} y={sy(t) + 3} textAnchor="end">{t.toFixed(1)}</text>
          </g>
        ))}
        <circle cx={sx(0)} cy={sy(0)} r={workspace.max_reach_m * scale} fill="none"
          stroke="var(--ink-3)" strokeDasharray="3 3" />
        {workspace.points.map(([x, y], i) => (
          <circle key={i} cx={sx(x)} cy={sy(y)} r={hover === i ? 4 : 2}
            fill="var(--data)" fillOpacity={hover === i ? 1 : 0.55}
            stroke={hover === i ? "var(--panel)" : "none"} strokeWidth={2} />
        ))}
        {workspace.points.map(([x, y], i) => (
          <circle key={`h${i}`} cx={sx(x)} cy={sy(y)} r={6} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        <rect x={sx(0) - 5} y={sy(0) - 5} width={10} height={10} fill="var(--ink)" rx={2} />
        <text x={SIZE - PAD} y={PAD - 8} textAnchor="end" className="text-[9px]" fill="var(--ink-3)">x, y (m) · base ■</text>
      </svg>
      {p && (
        <div className="tabular pointer-events-none absolute top-1 left-1 rounded border border-line bg-panel-2 px-2 py-1 font-mono text-[11px] text-ink-2">
          x {p[0].toFixed(3)} · y {p[1].toFixed(3)} · z {p[2].toFixed(3)} m
        </div>
      )}
      <figcaption className="mt-1 text-[11px] text-ink-3">
        {workspace.points.length} of {workspace.samples_collision_free} collision-free samples shown
        ({workspace.samples_requested} drawn, seed {workspace.seed}). Dashed ring = max sampled reach.
      </figcaption>
    </figure>
  );
}
