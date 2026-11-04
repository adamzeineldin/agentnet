"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtM } from "@/lib/format";
import { familyOf } from "@/lib/tasks";
import type { RobotSummary } from "@/lib/types";
import { MiniTopView } from "../hood/Sketches";
import { SolutionDetail } from "../skills/SolutionDetail";
import { TRACE_COLORS, taskTitle, type TaskGroup } from "../skills/grouping";
import { routePhrase } from "../transfer/describe";
import { labHref } from "../lab/labQuery";
import { BackButton } from "./BackButton";
import { Collapsed } from "./Paged";
import type { LibraryQuery } from "./query";
import { RunList } from "./RunList";
import { LIST } from "./SkillList";
import { spreadOf } from "./spread";
import { VisibilityControl } from "./Visibility";

const SHOWN_ROBOTS = 6;
const SHOWN_MISSING = 8;

interface SkillPageProps {
  group: TaskGroup;
  robots: RobotSummary[];
  onChange: (patch: Partial<LibraryQuery>) => void;
  /** A skill was made public or private: reload the skills. */
  onShared: () => void;
}

function Heading({ children, count }: { children: string; count?: number }) {
  return <h3 className="mb-2 text-sm font-medium">{children}{count !== undefined && <span className="ml-1.5 font-normal text-ink-3">{count}</span>}</h3>;
}

/**
 * One skill. Left: the task from above, every robot that knows it (pick one) and who doesn't yet. Right: the picked
 * robot's recorded solution, then every run on this layout.
 */
export function SkillPage({ group, robots, onChange, onShared }: SkillPageProps) {
  const first = group.byRobot[0].latest;
  const name = (id: string) => robots.find((r) => r.robot_id === id)?.short_name ?? id;
  const colors = new Map(group.byRobot.map((b, i) => [b.robotId, TRACE_COLORS[i % TRACE_COLORS.length]]));
  const { teachers } = spreadOf(group);
  const teacher = group.byRobot.find((b) => b.robotId === teachers[0]) ?? group.byRobot[0];
  const missing = robots.filter((r) => !group.byRobot.some((b) => b.robotId === r.robot_id));
  const rows = [...group.byRobot].sort((a, b) => Number(!!a.latest.parent_skill_id) - Number(!!b.latest.parent_skill_id));
  const [picked, setPicked] = useState(teacher.robotId);
  const shown = group.byRobot.find((b) => b.robotId === picked) ?? teacher;
  const shownFrom = shown.latest.parent_skill_id ? String(shown.latest.provenance.transferred_from_robot) : null;

  return (
    <div className="space-y-5">
      <BackButton label="Skills" onClick={() => onChange({ open: null })} />
      <div>
        <h2 className="text-[26px] font-normal tracking-[-0.02em]">{taskTitle(first)}</h2>
        <p className="mt-1 text-sm text-ink-3">
          Worked out by the {name(teacher.robotId)} · known by {rows.length} {rows.length === 1 ? "robot" : "robots"}
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="soft-card space-y-2 p-3">
            <MiniTopView task={first.task} traces={group.byRobot.map((b) => ({
              points: b.latest.executed_trace_task_frame, label: name(b.robotId), color: colors.get(b.robotId)!,
            }))} />
            <p className="flex gap-3 px-1 text-[11px] text-ink-3"><span>● start</span><span>○ target</span><span>▭ obstacle</span></p>
          </div>
          <section>
            <Heading count={rows.length}>Robots that know it</Heading>
            <ul className={LIST} aria-label="Robots that know this skill">
              <Collapsed items={rows} limit={SHOWN_ROBOTS} noun="robots" listItem render={({ robotId, latest }) => {
                const from = latest.parent_skill_id ? String(latest.provenance.transferred_from_robot) : null;
                return (
                  <li key={robotId}>
                    <button type="button" aria-pressed={robotId === shown.robotId} onClick={() => setPicked(robotId)}
                      aria-label={`Show the ${name(robotId)}'s solution`}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-panel-2/60 ${robotId === shown.robotId ? "bg-panel-2" : ""}`}>
                      <span aria-hidden="true" className="h-1 w-4 shrink-0 rounded-full" style={{ background: colors.get(robotId) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{name(robotId)}</span>
                        <span className="block truncate text-xs text-ink-3">{from ? `learned from the ${name(from)}` : "worked it out itself"}</span>
                      </span>
                      <span className="tabular font-mono text-[11px] text-ink-3" title="How far the hand ended from the target">
                        {fmtM(latest.validation.endpoint_error_m, 1)}</span>
                    </button>
                  </li>
                );
              }} />
            </ul>
          </section>
          {missing.length > 0 && (
            <section>
              <Heading count={missing.length}>Not yet</Heading>
              <div className="flex flex-wrap items-center gap-1.5">
                <Collapsed items={missing} limit={SHOWN_MISSING} noun="robots" render={(r) => (
                  <Link key={r.robot_id} className="pill py-1 text-xs"
                    href={labHref({ robot: r.robot_id, task: familyOf(group.sceneId), from: teacher.robotId })}>
                    Teach the {r.short_name}
                  </Link>
                )} />
              </div>
            </section>
          )}
        </div>
        <div className="min-w-0 space-y-6">
          <section aria-label={`The ${name(shown.robotId)}'s solution`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">
                The {name(shown.robotId)}{" "}
                <span className="font-normal text-ink-3">
                  · {shownFrom ? `learned from the ${name(shownFrom)}` : "worked it out itself"}
                  {" · "}{routePhrase(`${shown.latest.strategy.route_class}@${shown.latest.strategy.clearance_m}`)}
                </span>
              </h3>
              <button type="button" onClick={() => onChange({ view: "robots", open: shown.robotId })} className="text-xs text-accent hover:underline">
                Robot page →</button>
            </div>
            {shown.latest.mine && (
              <div className="mb-3">
                <VisibilityControl key={shown.latest.skill_id} kind="skill" id={shown.latest.skill_id}
                  visibility={shown.latest.visibility} onChanged={onShared} />
              </div>
            )}
            <SolutionDetail key={shown.latest.skill_id} capsule={shown.latest} robotName={name} onOpenRun={(run) => onChange({ run })} />
          </section>
          <section>
            <Heading>Runs on this layout</Heading>
            <RunList filter={{ scene_id: group.sceneId }} robots={robots} onOpen={(run) => onChange({ run })} />
          </section>
        </div>
      </div>
    </div>
  );
}
