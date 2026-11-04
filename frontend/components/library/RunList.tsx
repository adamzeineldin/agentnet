"use client";

import { fmtDateTime, fmtM } from "@/lib/format";
import type { RobotSummary, RunRecord } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { RUN_KIND } from "../history/runKinds";
import { ErrorNote, StatusBadge } from "../ui";
import { Collapsed } from "./Paged";
import { LIST } from "./SkillList";
import { PrivateBadge } from "./Visibility";

const LIMIT = 50;
const SHOWN = 5;
const REFRESH_MS = 5000;

interface RunListProps {
  /** Runs on one skill's layout, or every run of one robot. */
  filter: { scene_id: string } | { robot_id: string };
  robots: RobotSummary[];
  /** Scene id → "Reach past a wall · layout 7", shown when the runs span several skills. */
  layoutName?: (sceneId: string) => string;
  onOpen: (runId: string) => void;
}

/** The attempts behind a skill or a robot, newest first, failures included; each opens the full run. */
export function RunList({ filter, robots, layoutName, onOpen }: RunListProps) {
  const params = new URLSearchParams({ ...filter, limit: String(LIMIT), full: "false" });
  const runs = useApi<RunRecord[]>(`/api/runs?${params}`, REFRESH_MS);
  const name = (id: string) => robots.find((r) => r.robot_id === id)?.short_name ?? id;
  if (runs.error) return <ErrorNote message={runs.error} />;
  if (!runs.data) return null;
  if (runs.data.length === 0) return <p className="text-sm text-ink-3">No runs yet.</p>;
  return (
    <ul className={LIST} aria-label="Runs">
      <Collapsed items={runs.data} limit={SHOWN} noun="runs" listItem render={(r) => {
        const who = [r.source_robot_id, r.target_robot_id].filter((id): id is string => !!id).map(name).join(" → ") || "all robots";
        const scene = r.results.scene_id as string | undefined;
        return (
          <li key={r.run_id}>
            <button type="button" onClick={() => onOpen(r.run_id)} aria-label={`Open ${RUN_KIND[r.run_type]?.title ?? r.run_type} ${r.run_id}`}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-panel-2/60">
              <span className="w-20 shrink-0"><StatusBadge status={r.status} /></span>
              <span className="min-w-0 flex-1 truncate">
                {RUN_KIND[r.run_type]?.title ?? r.run_type} <span className="text-ink-3">· {who}{layoutName && scene ? ` · ${layoutName(scene)}` : ""}</span>
              </span>
              {r.visibility === "private" && <PrivateBadge />}
              {r.endpoint_error_m != null && <span className="tabular font-mono text-[11px] text-ink-3">{fmtM(r.endpoint_error_m, 1)}</span>}
              <span className="text-[11px] text-ink-3">{fmtDateTime(r.created_at)}</span>
            </button>
          </li>
        );
      }} />
    </ul>
  );
}
