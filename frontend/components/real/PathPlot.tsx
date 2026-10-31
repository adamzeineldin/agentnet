/** Top (x–y) and side (x–z) views of a recorded real path, with the simulated end-effector path overlaid. */

type Pt = number[];

interface PathPlotProps {
  recorded: Pt[];
  simulated?: Pt[];
}

const SIZE = 220;
const PAD = 18;

function project(points: Pt[], a: number, b: number, bounds: Bounds): string {
  return points.map((p) => {
    const x = PAD + ((p[a] - bounds.lo[a]) / bounds.span) * (SIZE - 2 * PAD);
    const y = SIZE - PAD - ((p[b] - bounds.lo[b]) / bounds.span) * (SIZE - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

interface Bounds { lo: number[]; span: number }

function bounds(points: Pt[]): Bounds {
  const lo = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])));
  // One scale for every axis (so views are not distorted), each axis centred on the path.
  const span = Math.max(...[0, 1, 2].map((k) => hi[k] - lo[k]), 0.05) * 1.1;
  return { lo: [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2 - span / 2), span };
}

function View({ title, a, b, recorded, simulated, box }: PathPlotProps & { title: string; a: number; b: number; box: Bounds }) {
  const [sx, sy] = project([recorded[0]], a, b, box).split(",");
  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${title} of the end-effector path`}
        className="w-full max-w-[260px] rounded-xl border border-line bg-panel-2">
        <polyline points={project(recorded, a, b, box)} fill="none" stroke="var(--good)" strokeWidth="2" strokeLinejoin="round" />
        {simulated && simulated.length > 1 && (
          <polyline points={project(simulated, a, b, box)} fill="none" stroke="var(--accent)" strokeWidth="1.25"
            strokeDasharray="4 3" strokeLinejoin="round" />
        )}
        <circle cx={sx} cy={sy} r="3.5" fill="var(--ink)" />
      </svg>
      <figcaption className="mt-1 font-mono text-[10px] text-ink-3">{title}</figcaption>
    </figure>
  );
}

export function PathPlot({ recorded, simulated }: PathPlotProps) {
  if (recorded.length < 2) return null;
  const box = bounds([...recorded, ...(simulated ?? [])]);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <View title="top view (x → right, y ↑)" a={0} b={1} recorded={recorded} simulated={simulated} box={box} />
        <View title="side view (x → right, z ↑)" a={0} b={2} recorded={recorded} simulated={simulated} box={box} />
      </div>
      <div className="flex flex-wrap gap-4 font-mono text-[10px] text-ink-3">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-good" aria-hidden="true" />recorded on the real robot</span>
        {simulated && <span className="flex items-center gap-1.5"><span className="h-0 w-5 border-t border-dashed border-accent" aria-hidden="true" />simulated end effector</span>}
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ink" aria-hidden="true" />start</span>
      </div>
    </div>
  );
}
