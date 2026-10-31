import type { Placement, TaskSpec, Vec3 } from "@/lib/types";

export interface Trace { points: Vec3[]; label: string; color: string; dashed?: boolean }

const W = 340;
const H = 200;
const PAD = 26;

function fit(points: [number, number][]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min((W - 2 * PAD) / (x1 - x0 || 1), (H - 2 * PAD) / (y1 - y0 || 1));
  const ox = (W - (x1 - x0) * s) / 2;
  const oy = (H - (y1 - y0) * s) / 2;
  return { s, sx: (v: number) => ox + (v - x0) * s, sy: (v: number) => H - oy - (v - y0) * s };
}

/** One projection of a task-frame scene: the wall(s), start, target and any recorded hand paths. */
function View({ task, traces, axes, title, caption }: {
  task: TaskSpec; traces: Trace[]; axes: [number, number]; title: string; caption: string;
}) {
  const [a, b] = axes;
  const corners = task.obstacles.flatMap((o) => [
    [o.center[a] - o.half_size[a], o.center[b] - o.half_size[b]], [o.center[a] + o.half_size[a], o.center[b] + o.half_size[b]],
  ] as [number, number][]);
  const pts: [number, number][] = [[task.start[a], task.start[b]], [task.target[a], task.target[b]], ...corners,
    ...traces.flatMap((t) => t.points.map((p) => [p[a], p[b]] as [number, number]))];
  if (b === 2) pts.push([pts[0][0], 0]);
  const { s, sx, sy } = fit(pts);
  const poly = (ps: Vec3[]) => ps.map((p) => `${sx(p[a]).toFixed(1)},${sy(p[b]).toFixed(1)}`).join(" ");
  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${caption}`} className="w-full rounded-xl bg-panel-2/60">
        {b === 2 && <line x1={8} x2={W - 8} y1={sy(0)} y2={sy(0)} stroke="var(--line-strong)" />}
        {task.obstacles.map((o) => (
          <rect key={o.name} x={sx(o.center[a] - o.half_size[a])} y={sy(o.center[b] + o.half_size[b])}
            width={2 * o.half_size[a] * s} height={2 * o.half_size[b] * s} rx={3}
            fill="var(--ink-3)" fillOpacity={0.3} stroke="var(--ink-3)" />
        ))}
        {traces.map((t) => (
          <polyline key={t.label} points={poly(t.points)} fill="none" stroke={t.color} strokeWidth={2.5}
            strokeDasharray={t.dashed ? "5 4" : undefined} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <circle cx={sx(task.start[a])} cy={sy(task.start[b])} r={5} fill="var(--ink)" stroke="var(--panel)" strokeWidth={2} />
        <circle cx={sx(task.target[a])} cy={sy(task.target[b])} r={6} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        <text x={sx(task.start[a])} y={sy(task.start[b]) + 18} textAnchor="middle" fontSize={11} fill="var(--ink-2)">start</text>
        <text x={sx(task.target[a])} y={sy(task.target[b]) + 19} textAnchor="middle" fontSize={11} fill="var(--ink-2)">target</text>
      </svg>
      <figcaption className="mt-1.5 text-xs text-ink-3"><span className="text-ink-2">{title}.</span> {caption}</figcaption>
    </figure>
  );
}

export function TaskSketch({ task, traces }: { task: TaskSpec; traces: Trace[] }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <View task={task} traces={traces} axes={[1, 2]} title="Side view" caption="Height above the floor; the grey block is the wall. A route that goes around the wall looks like it crosses it here; the top view shows it going around." />
        <View task={task} traces={traces} axes={[1, 0]} title="Top view" caption="Seen from above; up the page is away from the robot." />
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
        {traces.map((t) => (
          <li key={t.label} className="flex items-center gap-2">
            <svg width="22" height="6" aria-hidden="true"><line x1="1" x2="21" y1="3" y2="3" stroke={t.color} strokeWidth={2.5} strokeDasharray={t.dashed ? "5 4" : undefined} /></svg>
            {t.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface Seat { name: string; placement: Placement; reach: number }

/** Top-down: each arm's base, its measured reach, and where the task sits in front of it, drawn to one shared scale. */
export function PlacementSketch({ task, seats }: { task: TaskSpec; seats: Seat[] }) {
  const span = Math.max(...seats.map((s) => Math.max(s.reach, s.placement.translation[0] + 0.3)));
  const scale = (W / 2 - PAD) / span;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {seats.map((seat) => {
        const cx = W / 2;
        const cy = H - 18;
        const px = (p: Vec3) => cx + (p[1] + seat.placement.translation[1]) * scale;
        const py = (p: Vec3) => cy - (p[0] + seat.placement.translation[0]) * scale;
        const d = seat.placement.translation[0];
        return (
          <figure key={seat.name} className="min-w-0">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" className="w-full rounded-xl bg-panel-2/60"
              aria-label={`${seat.name}: task placed ${d.toFixed(2)} m in front of the base; measured reach ${seat.reach.toFixed(2)} m`}>
              <path d={`M ${cx - seat.reach * scale} ${cy} A ${seat.reach * scale} ${seat.reach * scale} 0 0 1 ${cx + seat.reach * scale} ${cy}`}
                fill="var(--accent)" fillOpacity={0.06} stroke="var(--accent)" strokeOpacity={0.5} strokeDasharray="4 4" />
              {task.obstacles.map((o) => {
                const lo: Vec3 = [o.center[0] - o.half_size[0], o.center[1] - o.half_size[1], 0];
                const hi: Vec3 = [o.center[0] + o.half_size[0], o.center[1] + o.half_size[1], 0];
                return <rect key={o.name} x={px(lo)} y={py(hi)} width={(hi[1] - lo[1]) * scale} height={(hi[0] - lo[0]) * scale}
                  rx={2} fill="var(--ink-3)" fillOpacity={0.35} />;
              })}
              <circle cx={px(task.start)} cy={py(task.start)} r={3.5} fill="var(--ink)" />
              <circle cx={px(task.target)} cy={py(task.target)} r={4} fill="none" stroke="var(--accent)" strokeWidth={2} />
              <line x1={cx} x2={cx} y1={cy} y2={py([0, 0, 0])} stroke="var(--ink-3)" strokeDasharray="2 3" />
              <text x={cx + 6} y={(cy + py([0, 0, 0])) / 2} fontSize={11} fill="var(--ink-2)">{d.toFixed(2)} m</text>
              <rect x={cx - 9} y={cy - 9} width={18} height={18} rx={5} fill="var(--ink)" />
              <text x={cx + seat.reach * scale - 4} y={cy - 6} textAnchor="end" fontSize={10} fill="var(--accent)">reach {seat.reach.toFixed(2)} m</text>
            </svg>
            <figcaption className="mt-1.5 text-xs text-ink-2">{seat.name}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}
