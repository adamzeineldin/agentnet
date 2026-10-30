import type { ControllerExecution } from "@/lib/types";
import { Badge, Stat } from "../ui";

function fmt(v: number | null, unit: string, digits = 2): string {
  return v == null ? "—" : `${v.toFixed(digits)} ${unit}`;
}

/** What the URSim controller reported after the verified path was streamed to it. Never physical-world evidence. */
export function ControllerPanel({ execution: ce }: { execution: ControllerExecution }) {
  const ok = ce.status === "succeeded";
  return (
    <div className="space-y-3 border-t border-line pt-3" aria-label="Controller execution">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Controller execution</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="warn">{ce.label}</Badge>
          <Badge tone={ok ? "good" : "bad"}>{ok ? "succeeded" : "failed"}</Badge>
        </div>
      </div>
      {ce.error && <p className="text-xs text-bad">{ce.error}</p>}
      {ce.final_joint_error_rad != null && (
        <div className="metric-grid grid grid-cols-2">
          <Stat label="TCP to target" value={fmt(ce.tcp_to_target_mm, "mm")} hint="controller-reported" />
          <Stat label="TCP vs MuJoCo model" value={fmt(ce.tcp_vs_model_mm, "mm")} hint="same joints" />
          <Stat label="Final joint error" value={fmt(ce.final_joint_error_rad * 1000, "mrad")} hint="largest joint" />
          <Stat label="Controller time" value={fmt(ce.duration_s, "s")} hint={`${ce.commanded_samples} samples @ ${ce.stream_hz} Hz`} />
        </div>
      )}
      {Object.keys(ce.checks).length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {Object.entries(ce.checks).map(([k, v]) => (
            <li key={k}><Badge tone={v ? "good" : "bad"}>{v ? "✓" : "✕"} {k.replaceAll("_", " ")}</Badge></li>
          ))}
        </ul>
      )}
      <p className="font-mono text-[11px] text-ink-3">
        {[ce.controller_version && `PolyScope ${ce.controller_version}`,
          ce.robot_model && `${ce.robot_model}${ce.controller_version?.startsWith("5.") ? " e-Series" : ""}`,
          `${ce.path_waypoints} waypoints`]
          .filter(Boolean).join(" · ")}
      </p>
      <ul className="space-y-1 text-[11px] text-ink-3">{ce.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}
