import type { JointInfo } from "@/lib/types";

const SPAN = 2 * Math.PI;

/** Joint ranges on a shared ±2π axis with the home configuration marked. */
export function JointLimits({ joints, home }: { joints: JointInfo[]; home: number[] }) {
  const pct = (v: number) => ((v + SPAN) / (2 * SPAN)) * 100;
  return (
    <div className="space-y-1.5">
      {joints.map((j, i) => (
        <div key={j.name} className="grid grid-cols-[9rem_1fr_8.5rem] items-center gap-3 text-xs">
          <span className="truncate font-mono text-ink-2" title={j.name}>{j.name}</span>
          <div className="relative h-3 rounded bg-panel-2" title={`[${j.lower.toFixed(3)}, ${j.upper.toFixed(3)}] rad · home ${home[i].toFixed(3)}`}>
            <div className="absolute top-1/2 h-px w-full bg-line-strong" />
            <div className="absolute inset-y-0.5 rounded-sm bg-data/70"
              style={{ left: `${pct(j.lower)}%`, width: `${pct(j.upper) - pct(j.lower)}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${pct(home[i])}%` }} />
          </div>
          <span className="tabular text-right font-mono text-ink-3">
            {j.lower.toFixed(2)} … {j.upper.toFixed(2)}
          </span>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-ink-3">Axis spans −2π…+2π rad. Bar = joint range from the model; white tick = home pose.</p>
    </div>
  );
}
