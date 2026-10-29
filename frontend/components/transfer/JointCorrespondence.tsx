"use client";

import { useApi } from "@/lib/useApi";
import type { JointInfo, RobotPassport } from "@/lib/types";
import { ErrorNote, Loading, Panel } from "../ui";

function Limit({ joint, scale }: { joint?: JointInfo; scale: number }) {
  if (!joint) return <span className="text-ink-3">No joint at this chain position</span>;
  return <div className="min-w-0 space-y-2">
    <div className="break-all font-mono text-xs">{joint.name}</div>
    <div className="h-0.5 bg-line"><div className="h-full bg-ink" style={{ width: `${joint.limited && scale > 0 ? Math.min(100, (joint.upper - joint.lower) / scale * 100) : 0}%` }} /></div>
    <div className="font-mono text-[10px] text-ink-3">{joint.limited ? `${joint.lower.toFixed(2)} … ${joint.upper.toFixed(2)} ${joint.joint_type === "hinge" ? "rad" : "m"}` : "Unlimited in model"}</div>
  </div>;
}

export function JointCorrespondence({ sourceId, targetId }: { sourceId: string; targetId: string }) {
  const source = useApi<RobotPassport>(`/api/robots/${sourceId}`);
  const target = useApi<RobotPassport>(`/api/robots/${targetId}`);
  const a = source.data, b = target.data;
  const joints = [...(a?.arm_joints ?? []), ...(b?.arm_joints ?? [])];
  const span = (type: JointInfo["joint_type"]) => Math.max(0, ...joints.filter((j) => j.limited && j.joint_type === type).map((j) => j.upper - j.lower));
  return <Panel title="Joint correspondence" right={<span className="font-mono text-[11px] text-ink-3">model-derived limits</span>}>
    {(source.error || target.error) && <ErrorNote message={(source.error || target.error)!} />}
    {(source.loading || target.loading) && <Loading label="Loading joint limits…" />}
    {a && b && <>
      <div className="mb-4 grid grid-cols-2 gap-6 text-sm"><div>{a.display_name}<p className="mt-1 font-mono text-xs text-ink-3">{a.dof} DOF</p></div><div>{b.display_name}<p className="mt-1 font-mono text-xs text-ink-3">{b.dof} DOF</p></div></div>
      <div className="divide-y divide-line border-y border-line">
        {Array.from({ length: Math.max(a.arm_joints.length, b.arm_joints.length) }, (_, i) => <div key={i} className="grid grid-cols-2 gap-6 py-3">
          <Limit joint={a.arm_joints[i]} scale={span(a.arm_joints[i]?.joint_type ?? "hinge")} />
          <Limit joint={b.arm_joints[i]} scale={span(b.arm_joints[i]?.joint_type ?? "hinge")} />
        </div>)}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">Rows compare chain order, not a one-to-one joint mapping. Bars show each model’s allowed range relative to the largest range of the same joint type. No fit score is available. Transfer carries task intent and geometry; the target independently re-solves IK and verifies the result in simulation.</p>
    </>}
  </Panel>;
}
