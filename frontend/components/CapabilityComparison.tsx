import type { ReactNode } from "react";
import { fmtM } from "@/lib/format";
import type { RobotPassport } from "@/lib/types";
import { Panel, ProvenanceTag } from "./ui";
import type { Provenance } from "@/lib/types";

function ik(p: RobotPassport) {
  const cap = p.capabilities.find((c) => c.task_type === "position_ik");
  if (!cap) return "—";
  const e = cap.evidence as Record<string, number>;
  return `${e.successes}/${e.probes} (${fmtM(e.median_error_m, 2)} median)`;
}

const ROWS: { label: string; prov: Provenance; get: (p: RobotPassport) => ReactNode }[] = [
  { label: "Arm DOF", prov: "model", get: (p) => p.dof },
  { label: "Actuation", prov: "model", get: (p) => `${p.actuators.length}× ${p.actuators[0]?.control_mode.replace("_", " ")}` },
  { label: "End-effector site", prov: "model", get: (p) => `${p.end_effector.site_name} on ${p.end_effector.parent_body}${p.end_effector.source === "added_by_agentnet" ? " (added)" : ""}` },
  { label: "Tool", prov: "declared", get: (p) => p.tool_type },
  { label: "Max sampled reach", prov: "measured", get: (p) => fmtM(p.workspace.max_reach_m, 0) },
  { label: "Median sampled reach", prov: "measured", get: (p) => fmtM(p.workspace.median_reach_m, 0) },
  { label: "Collision-free samples", prov: "measured", get: (p) => `${p.workspace.samples_collision_free} / ${p.workspace.samples_requested}` },
  { label: "Self-collision rejects", prov: "measured", get: (p) => p.workspace.rejected_self_collision },
  { label: "Floor/env rejects", prov: "measured", get: (p) => p.workspace.rejected_floor_or_env },
  { label: "Position IK probes", prov: "measured", get: ik },
  { label: "Obstacle-aware reach", prov: "declared", get: (p) => p.capabilities.find((c) => c.task_type === "obstacle_aware_reach")?.status ?? "—" },
];

export function CapabilityComparison({ a, b }: { a: RobotPassport; b: RobotPassport }) {
  return (
    <Panel title="Side-by-side capability comparison">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-ink-3 uppercase">
              <th className="pb-2 font-medium">Property</th>
              <th className="pb-2 font-medium">Source</th>
              <th className="pb-2 font-medium">{a.short_name}</th>
              <th className="pb-2 font-medium">{b.short_name}</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <td className="py-2 text-ink-2">{row.label}</td>
                <td className="py-2"><ProvenanceTag p={row.prov} /></td>
                <td className="py-2">{row.get(a)}</td>
                <td className="py-2">{row.get(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
