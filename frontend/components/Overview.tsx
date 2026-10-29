"use client";

import Link from "next/link";
import { fmtDateTime, fmtM } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { ExperienceCapsule, RobotSummary, RunRecord } from "@/lib/types";
import { ParticleArm } from "./ParticleArm";
import { RobotCard } from "./RobotCard";
import { ErrorNote, Loading, Panel, Stat, StatusBadge } from "./ui";

export function Overview() {
  const robots = useApi<RobotSummary[]>("/api/robots");
  const runs = useApi<RunRecord[]>("/api/runs?limit=500", 5000);
  const skills = useApi<ExperienceCapsule[]>("/api/skills", 10000);
  const adaptations = skills.data?.filter((s) => s.parent_skill_id !== null).length;
  const all = runs.data ?? [];
  const succeeded = all.filter((r) => r.status === "succeeded").length;
  const failed = all.filter((r) => r.status === "failed").length;

  return (
    <div className="space-y-6">
      <section data-landing-hero className="landing-hero">
        <ParticleArm />
        <div data-hero-copy className="hero-copy">
          <p className="eyebrow">Simulate · Remember · Retarget</p>
          <h1>One robot learns it.<br />Every robot remembers.</h1>
          <p className="hero-description">
            AgentNet discovers robot motion in simulation, stores verified experience in shared memory,
            and retargets each skill through another robot’s own kinematics.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/robots" className="button-primary">Open console</Link>
            <Link href="/skills" className="button-secondary">Browse skills</Link>
          </div>
          <div className="hero-steps">
            <div><h2>Simulate</h2><p>Search motion candidates and verify them in MuJoCo.</p></div>
            <div><h2>Remember</h2><p>Publish simulation-verified experience with its evidence.</p></div>
            <div><h2>Retarget</h2><p>Solve new joint paths and verify each adaptation in simulation.</p></div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-[1fr_1fr_20rem]">
        {robots.error && <ErrorNote message={robots.error} />}
        {robots.loading && <Loading label="Loading robot passports…" />}
        {robots.data?.map((r) => <RobotCard key={r.robot_id} robot={r} href={`/robots?robot=${r.robot_id}`} />)}
        <Panel title="Network activity">
          <div className="metric-grid mb-4 grid grid-cols-3">
            <Stat label="Sim runs" value={runs.data ? all.length : "—"} hint="recorded" />
            <Stat label="Succeeded" value={runs.data ? succeeded : "—"} />
            <Stat label="Failed" value={runs.data ? failed : "—"} />
            <Stat label="Skills" value={skills.data ? skills.data.length - (adaptations ?? 0) : "—"} hint="original" />
            <Stat label="Adaptations" value={skills.data ? adaptations : "—"} hint="with lineage" />
            <Stat label="Transfers" value={runs.data ? all.filter((r) => r.run_type === "transfer").length : "—"} />
          </div>
          {runs.error && <ErrorNote message={runs.error} />}
          {runs.data && all.length === 0 && <p className="text-xs text-ink-3">No runs recorded yet. Run a motion check from Robot Fleet.</p>}
          <ol className="space-y-2">
            {all.slice(0, 9).map((r) => (
              <li key={r.run_id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate text-ink-2">
                    {r.run_type.replace("_", " ")} · {r.target_robot_id ? `${r.source_robot_id} → ${r.target_robot_id}` : r.source_robot_id}
                    {r.model_used ? ` · ${r.model_used}` : ""}
                  </div>
                  <div className="text-ink-3">{fmtDateTime(r.created_at)} · err {fmtM(r.endpoint_error_m, 2)}</div>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
