"use client";

import { apiUrl } from "@/lib/api";
import { fmtDateTime, shortHash } from "@/lib/format";
import type { RobotPassport } from "@/lib/types";
import { JointLimits } from "./JointLimits";
import { MotionCheckPanel } from "./MotionCheckPanel";
import { WorkspacePlot } from "./WorkspacePlot";
import { Badge, Panel, ProvenanceTag } from "./ui";

export function PassportView({ passport: p }: { passport: RobotPassport }) {
  const prov = p.field_provenance;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <Panel title="Passport" right={<span className="font-mono text-[11px] text-ink-3">schema v{p.schema_version}</span>}>
          {/* eslint-disable-next-line @next/next/no-img-element -- MuJoCo render served by backend */}
          <img src={apiUrl(`/artifacts/snapshots/${p.robot_id}.png`)} alt={`${p.short_name} at home pose`}
            className="mb-4 aspect-video w-full border border-line object-cover" />
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-xs">
            <dt className="text-ink-3">Model</dt><dd className="font-mono">{p.model_file}</dd>
            <dt className="text-ink-3">Version</dt><dd className="font-mono">{p.model_version} · MuJoCo {p.mujoco_version}</dd>
            <dt className="text-ink-3">Model hash</dt><dd className="font-mono" title={p.model_hash}>{shortHash(p.model_hash)}… <ProvenanceTag p={prov.model_hash} /></dd>
            <dt className="text-ink-3">End effector</dt>
            <dd>
              <span className="font-mono">{p.end_effector.site_name}</span> on <span className="font-mono">{p.end_effector.parent_body}</span>{" "}
              <ProvenanceTag p={prov.end_effector} />
              <div className="mt-0.5 text-ink-3">{p.end_effector.note}</div>
            </dd>
            <dt className="text-ink-3">Base frame</dt><dd>{p.base_frame.body} · {p.base_frame.convention}</dd>
            <dt className="text-ink-3">Tool</dt><dd>{p.tool_type} <ProvenanceTag p={prov.tool_type} /></dd>
            <dt className="text-ink-3">Calibration</dt><dd><Badge tone="warn">{p.calibration_status}</Badge></dd>
            <dt className="text-ink-3">Computed</dt><dd>{fmtDateTime(p.created_at)} in {p.compute_seconds.toFixed(2)} s</dd>
          </dl>
        </Panel>
        <Panel title="Joint limits" right={<ProvenanceTag p={prov.arm_joints} />}>
          <JointLimits joints={p.arm_joints} home={p.home_qpos} />
        </Panel>
        <Panel title="Actuators" right={<ProvenanceTag p={prov.actuators} />}>
          <table className="tabular w-full text-xs">
            <thead><tr className="text-left text-ink-3"><th className="pb-1 font-normal">Actuator</th><th className="pb-1 font-normal">Joint</th><th className="pb-1 text-right font-normal">kp</th><th className="pb-1 text-right font-normal">kv</th><th className="pb-1 text-right font-normal">Force (N·m)</th></tr></thead>
            <tbody className="font-mono">
              {p.actuators.map((a) => (
                <tr key={a.name} className="border-t border-line">
                  <td className="py-1">{a.name}</td><td>{a.joint_name}</td>
                  <td className="text-right">{a.kp}</td><td className="text-right">{a.kv}</td>
                  <td className="text-right">{a.force_range ? `±${a.force_range[1]}` : "no limit"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
      <div className="min-w-0 space-y-4">
        <MotionCheckPanel robotId={p.robot_id} robotName={p.short_name} />
        <Panel title="Sampled workspace" right={<ProvenanceTag p={prov.workspace} />}>
          <WorkspacePlot workspace={p.workspace} label={p.short_name} />
          <p className="mt-2 text-[11px] text-ink-3">{p.workspace.method}. Reach measured as {p.workspace.reach_reference}.</p>
        </Panel>
        <Panel title="Capabilities & evidence">
          <ul className="space-y-3 text-xs">
            {p.capabilities.map((c) => (
              <li key={c.task_type}>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{c.task_type}</span>
                  <Badge tone={c.status === "unverified" ? "warn" : c.status === "verified_in_sim" ? "good" : "accent"}>{c.status.replaceAll("_", " ")}</Badge>
                  <ProvenanceTag p={c.provenance} />
                </div>
                {Object.keys(c.evidence).length > 0 && (
                  <div className="mt-1 font-mono text-ink-3">
                    {Object.entries(c.evidence).map(([k, v]) => `${k}=${typeof v === "number" ? +v.toFixed(5) : v}`).join(" · ")}
                  </div>
                )}
                <p className="mt-0.5 text-ink-3">{c.note}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Simulation assumptions">
          <ul className="list-disc space-y-1 pl-4 text-xs text-ink-2">
            {p.simulation_assumptions.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
