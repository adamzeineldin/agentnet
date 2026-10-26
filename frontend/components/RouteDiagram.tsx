"use client";

import type { CandidateOutcome, CandidateSummary, TaskSpec, Vec3 } from "@/lib/types";

type Group = "verified" | "feasible" | "rejected";
export const outcomeGroup = (o: CandidateOutcome): Group =>
  o === "verified" ? "verified" : o === "feasible" || o === "not_simulated" ? "feasible" : "rejected";

const STYLE: Record<Group, { stroke: string; width: number; opacity: number; dash?: string }> = {
  verified: { stroke: "var(--good)", width: 2, opacity: 0.95 },
  feasible: { stroke: "var(--data)", width: 2, opacity: 0.85 },
  rejected: { stroke: "var(--bad)", width: 1.5, opacity: 0.4, dash: "4 3" },
};

const W = 300;
const H = 190;
const PAD = 22;

interface ViewProps {
  title: string;
  task: TaskSpec;
  candidates: CandidateSummary[];
  axes: [0 | 1 | 2, 0 | 1 | 2];
  labels: [string, string];
  selectedId?: string | null;
  hoverId?: string | null;
  onHover?: (id: string | null) => void;
}

function View({ title, task, candidates, axes, labels, selectedId, hoverId, onHover }: ViewProps) {
  const [ax, ay] = axes;
  const pts: Vec3[] = [task.start, task.target, ...candidates.flatMap((c) => c.waypoints_task),
    ...task.obstacles.flatMap((o) => [
      o.center.map((v, i) => v - o.half_size[i]) as Vec3, o.center.map((v, i) => v + o.half_size[i]) as Vec3])];
  const xs = pts.map((p) => p[ax]);
  const ys = pts.map((p) => p[ay]);
  const [x0, x1] = [Math.min(...xs) - 0.04, Math.max(...xs) + 0.04];
  const [y0, y1] = [Math.min(...ys) - 0.04, Math.max(...ys) + 0.04];
  const s = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0));
  const sx = (v: number) => PAD + (v - x0) * s;
  const sy = (v: number) => H - PAD - (v - y0) * s;
  const line = (wps: Vec3[]) => wps.map((p) => `${sx(p[ax]).toFixed(1)},${sy(p[ay]).toFixed(1)}`).join(" ");
  const ordered = [...candidates].sort((a, b) => {
    const rank = (c: CandidateSummary) => (c.candidate_id === selectedId || c.candidate_id === hoverId ? 3 : { rejected: 0, feasible: 1, verified: 2 }[outcomeGroup(c.outcome)]);
    return rank(a) - rank(b);
  });

  return (
    <figure>
      <figcaption className="mb-1 text-[11px] text-ink-3">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-line bg-panel-2/40" role="img"
        aria-label={`${title}: ${candidates.length} candidate routes around the obstacle`}>
        {axes[1] === 2 && <line x1={PAD} x2={W - PAD} y1={sy(0)} y2={sy(0)} stroke="var(--line-strong)" />}
        {task.obstacles.map((o) => (
          <rect key={o.name} x={sx(o.center[ax] - o.half_size[ax])} y={sy(o.center[ay] + o.half_size[ay])}
            width={2 * o.half_size[ax] * s} height={2 * o.half_size[ay] * s}
            fill="var(--ink-3)" fillOpacity={0.35} stroke="var(--ink-3)" rx={2} />
        ))}
        {ordered.map((c) => {
          const g = outcomeGroup(c.outcome);
          const st = STYLE[g];
          const emph = c.candidate_id === selectedId || c.candidate_id === hoverId;
          return (
            <g key={c.candidate_id} onMouseEnter={() => onHover?.(c.candidate_id)} onMouseLeave={() => onHover?.(null)}>
              <polyline points={line(c.waypoints_task)} fill="none" stroke="transparent" strokeWidth={10} />
              <polyline points={line(c.waypoints_task)} fill="none" stroke={st.stroke}
                strokeWidth={emph ? st.width + 1.5 : st.width} strokeOpacity={emph ? 1 : st.opacity}
                strokeDasharray={emph ? undefined : st.dash} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        <circle cx={sx(task.start[ax])} cy={sy(task.start[ay])} r={4.5} fill="var(--ink)" stroke="var(--panel)" strokeWidth={2} />
        <circle cx={sx(task.target[ax])} cy={sy(task.target[ay])} r={5} fill="none" stroke="var(--accent)" strokeWidth={2} />
        <text x={sx(task.start[ax]) + 7} y={sy(task.start[ay]) - 6} className="text-[9px]" fill="var(--ink-2)">start</text>
        <text x={sx(task.target[ax]) + 7} y={sy(task.target[ay]) - 6} className="text-[9px]" fill="var(--ink-2)">target</text>
        <text x={W - PAD} y={H - 6} textAnchor="end" className="text-[9px]" fill="var(--ink-3)">{labels[0]} →</text>
        <text x={6} y={PAD - 8} className="text-[9px]" fill="var(--ink-3)">↑ {labels[1]}</text>
      </svg>
    </figure>
  );
}

export function RouteDiagram(props: Omit<ViewProps, "title" | "axes" | "labels">) {
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <View {...props} title="Side view (y–z projection: side routes pass in front of / behind the obstacle)" axes={[1, 2]} labels={["y", "z"]} />
        <View {...props} title="Top view (task frame y–x, robot below)" axes={[1, 0]} labels={["y", "x (away from base)"]} />
      </div>
      <ul className="flex flex-wrap gap-4 text-[11px] text-ink-2">
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-good" />✓ verified in physics</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-data" />◦ kinematically feasible</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 border-t border-dashed border-bad" />✕ rejected</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ink-3/50" />obstacle</li>
      </ul>
    </div>
  );
}
