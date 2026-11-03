"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtM } from "@/lib/format";
import type { RobotSummary } from "@/lib/types";
import { MiniTopView } from "../hood/Sketches";
import { routePhrase } from "../transfer/describe";
import { SolutionDetail } from "./SolutionDetail";
import { TRACE_COLORS, taskTitle, type TaskGroup } from "./grouping";

interface TaskCardProps {
  group: TaskGroup;
  robots: RobotSummary[];
  robotName: (id: string) => string;
}

/** One task: a top-view sketch, every robot that can do it (how, and from whom), and who still can't. */
export function TaskCard({ group, robots, robotName }: TaskCardProps) {
  const [open, setOpen] = useState<string | null>(null);
  const first = group.byRobot[0].latest;
  const colors = new Map(group.byRobot.map((r, i) => [r.robotId, TRACE_COLORS[i % TRACE_COLORS.length]]));
  const missing = robots.filter((r) => !group.byRobot.some((b) => b.robotId === r.robot_id));
  const teacher = group.byRobot.find((b) => !b.latest.parent_skill_id) ?? group.byRobot[0];
  return (
    <article className="soft-card space-y-4 p-5" aria-label={taskTitle(first)}>
      <div className="grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <MiniTopView task={first.task} traces={group.byRobot.map((b) => ({
            points: b.latest.executed_trace_task_frame, label: robotName(b.robotId), color: colors.get(b.robotId)!,
          }))} />
          <p className="text-[11px] text-ink-3">Seen from above: start ●, target ○, obstacles ▭. One line per robot; a route over the top crosses them here.</p>
        </div>
        <div className="min-w-0 space-y-3">
          <h2 className="text-lg font-normal tracking-[-0.01em]">{taskTitle(first)}</h2>
          <ul className="space-y-2" aria-label="Robots that can do it">
            {group.byRobot.map(({ robotId, latest, saves }) => (
              <li key={robotId}>
                <button type="button" aria-expanded={open === latest.skill_id}
                  aria-label={`Watch the ${robotName(robotId)} do it`}
                  onClick={() => setOpen(open === latest.skill_id ? null : latest.skill_id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-line-strong">
                  <span aria-hidden="true" className="h-1 w-5 shrink-0 rounded-full" style={{ background: colors.get(robotId) }} />
                  <span className="font-medium">{robotName(robotId)}</span>
                  <span className="text-sm text-ink-2">{routePhrase(`${latest.strategy.route_class}@${latest.strategy.clearance_m}`)}</span>
                  <span className="text-xs text-ink-3">
                    {latest.parent_skill_id ? `learned from the ${robotName(String(latest.provenance.transferred_from_robot))}` : "learned it itself"}
                    {" · "}{fmtM(latest.validation.endpoint_error_m, 1)} off target{saves > 1 ? ` · saved ${saves}×` : ""}
                  </span>
                  <span className="ml-auto text-xs text-accent">{open === latest.skill_id ? "Hide" : "Watch"}</span>
                </button>
                {open === latest.skill_id && <div className="mt-2"><SolutionDetail capsule={latest} robotName={robotName} /></div>}
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
              <span>Can&apos;t do it yet:</span>
              {missing.map((r) => (
                <Link key={r.robot_id} className="pill py-1 text-xs"
                  href={`/transfer?source=${teacher.robotId}&target=${r.robot_id}&skill=${encodeURIComponent(teacher.latest.skill_id)}`}>
                  Teach the {r.short_name} →
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
