import type { TaskSpec } from "@/lib/types";

const W = 120;
const H = 80;
const PAD = 8;

/**
 * A layout drawn to scale: obstacles as boxes, start ● and target ○. Left to right is start side to target
 * side (task y). The top view puts the robot at the bottom (task x up); the side view shows heights (task z).
 */
export function TaskSketch({ task, view = "top", className = "h-16 w-full" }: {
  task: TaskSpec; view?: "top" | "side"; className?: string;
}) {
  const up = view === "top" ? 0 : 2; // task axis drawn upwards
  const boxes = task.obstacles.map((o) => ({
    name: o.name, y0: o.center[1] - o.half_size[1], y1: o.center[1] + o.half_size[1],
    u0: o.center[up] - o.half_size[up], u1: o.center[up] + o.half_size[up],
  }));
  const ys = [task.start[1], task.target[1], ...boxes.flatMap((b) => [b.y0, b.y1])];
  const us = [task.start[up], task.target[up], ...boxes.flatMap((b) => [b.u0, b.u1]), ...(view === "side" ? [0] : [])];
  const [yLo, yHi, uLo, uHi] = [Math.min(...ys), Math.max(...ys), Math.min(...us), Math.max(...us)];
  const s = Math.min((W - 2 * PAD) / Math.max(yHi - yLo, 0.05), (H - 2 * PAD) / Math.max(uHi - uLo, 0.05));
  const x = (v: number) => W / 2 + (v - (yLo + yHi) / 2) * s;
  const y = (v: number) => H / 2 - (v - (uLo + uHi) / 2) * s;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true">
      {view === "side" && <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-ink-3" strokeWidth={0.6} />}
      {boxes.map((b) => (
        <rect key={b.name} x={x(b.y0)} y={y(b.u1)} width={(b.y1 - b.y0) * s} height={(b.u1 - b.u0) * s} rx={1}
          className="fill-ink-3/40 stroke-ink-3" strokeWidth={0.6} />
      ))}
      <circle cx={x(task.start[1])} cy={y(task.start[up])} r={3} className="fill-ink" />
      <circle cx={x(task.target[1])} cy={y(task.target[up])} r={3} className="fill-none stroke-accent" strokeWidth={1.5} />
    </svg>
  );
}
