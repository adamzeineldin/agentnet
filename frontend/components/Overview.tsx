"use client";

import Link from "next/link";
import { fmtDateTime, fmtM } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { RobotSummary, RunRecord } from "@/lib/types";
import { RobotCard } from "./RobotCard";
import { ErrorNote, Loading, Panel, Stat, StatusBadge } from "./ui";

export function Overview() {
  const robots = useApi<RobotSummary[]>("/api/robots");
  const runs = useApi<RunRecord[]>("/api/runs?limit=500", 5000);
  const all = runs.data ?? [];
  const succeeded = all.filter((r) => r.status === "succeeded").length;
  const failed = all.filter((r) => r.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shared experience for physical AI</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Robots publish simulation-verified motion experience; robots with different bodies adapt it with
            their own kinematics and verify it in MuJoCo before reuse.
          </p>
        </div>
        <Link href="/robots"
          className="rounded-lg border border-accent-dim bg-accent/15 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/25">
          Open Robot Fleet →
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1fr_20rem]">
        {robots.error && <ErrorNote message={robots.error} />}
        {robots.loading && <Loading label="Loading robot passports…" />}
        {robots.data?.map((r) => <RobotCard key={r.robot_id} robot={r} href={`/robots?robot=${r.robot_id}`} />)}
        <Panel title="Network activity">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Sim runs" value={runs.data ? all.length : "—"} hint="recorded" />
            <Stat label="Verified" value={runs.data ? succeeded : "—"} />
            <Stat label="Failed" value={runs.data ? failed : "—"} />
          </div>
          {runs.error && <ErrorNote message={runs.error} />}
          {runs.data && all.length === 0 && <p className="text-xs text-ink-3">No runs recorded yet. Run a motion check from Robot Fleet.</p>}
          <ol className="space-y-2">
            {all.slice(0, 7).map((r) => (
              <li key={r.run_id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate text-ink-2">{r.run_type.replace("_", " ")} · {r.source_robot_id}</div>
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
