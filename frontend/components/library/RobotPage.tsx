"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { apiUrl } from "@/lib/api";
import { fmtMetres } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { RobotPassport, RobotSummary } from "@/lib/types";
import { PassportView } from "../PassportView";
import type { TaskGroup } from "../skills/grouping";
import { Disclosure, ErrorNote } from "../ui";
import { BackButton } from "./BackButton";
import { Paged } from "./Paged";
import type { LibraryQuery } from "./query";
import { RunList } from "./RunList";
import { LIST, SkillRow } from "./SkillList";
import { robotSkillCounts } from "./spread";
import { SharedBy, VisibilityControl } from "./Visibility";

const SKILL_PAGE = 10;

/** Catalog tool_type ("parallel_gripper_held_open (not used for reach)", "none (bare tool flange)") in plain words. */
function handName(toolType: string): string {
  if (toolType.startsWith("none")) return "no hand, bare flange";
  return toolType.replace(/_/g, " ").replace(/\s*\(.*\)$/, "");
}

/** One number about the arm; what it means is a hover hint, not more text on the page. */
function Fact({ label, value, meaning }: { label: string; value: ReactNode; meaning: string }) {
  return (
    <div title={meaning} className="min-w-0 rounded-xl bg-panel-2/60 px-3.5 py-3">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className="tabular mt-0.5 text-2xl font-light tracking-[-0.02em]">{value}</dd>
    </div>
  );
}

interface RobotPageProps {
  robot: RobotSummary;
  robots: RobotSummary[];
  groups: TaskGroup[];
  layoutName: (sceneId: string) => string;
  onChange: (patch: Partial<LibraryQuery>) => void;
  /** The robot was made public or private: reload the robot list. */
  onShared: () => void;
}

/** One robot: what it is, every skill it knows (each opens the skill), its runs and its technical sheet. */
export function RobotPage({ robot, robots, groups, layoutName, onChange, onShared }: RobotPageProps) {
  const passport = useApi<RobotPassport>(`/api/robots/${robot.robot_id}`);
  const known = groups.filter((g) => g.byRobot.some((b) => b.robotId === robot.robot_id));
  const { own, learned } = robotSkillCounts(groups, robot.robot_id);
  return (
    <div className="space-y-6">
      <BackButton label="Robots" onClick={() => onChange({ open: null })} />
      <section aria-label={`About the ${robot.short_name}`} className="soft-card grid gap-6 overflow-hidden p-5 md:grid-cols-[minmax(0,20rem)_1fr] md:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the backend from the loaded model */}
        <img src={apiUrl(robot.snapshot_url)} alt={`The ${robot.short_name}`} className="aspect-[4/3] w-full rounded-xl bg-panel-2 object-cover" />
        <div className="min-w-0 space-y-5">
          <div>
            <h2 className="text-2xl font-light tracking-[-0.02em]">{robot.display_name.replace(/^Robot [AB] · /, "")}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-2">
              <span className="rounded-full bg-panel-2 px-2.5 py-1">{robot.model_source.startsWith("uploaded") ? "Uploaded model" : `${robot.maker} model`}</span>
              <span className="rounded-full bg-panel-2 px-2.5 py-1">{handName(robot.tool_type)}</span>
            </div>
            <SharedBy by={robot.published_by} at={robot.published_at} mine={robot.mine} className="mt-2 block" />
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fact label="Joints" value={robot.dof} meaning="Motors that can turn. More joints means more ways to reach the same spot." />
            <Fact label="Reach" value={fmtMetres(robot.max_reach_m)} meaning="How far its hand can get from its shoulder." />
            <Fact label="Worked out" value={own} meaning="Skills it worked out by itself." />
            <Fact label="Learned" value={learned} meaning="Skills it learned from another robot." />
          </dl>
          <div className="flex flex-wrap gap-2">
            <Link href={`/lab?robot=${robot.robot_id}`} className="button-primary">Open it in the Lab</Link>
          </div>
          {robot.mine && <VisibilityControl kind="robot" id={robot.robot_id} visibility={robot.visibility} onChanged={onShared} />}
        </div>
      </section>
      <div className="space-y-6">
        <section aria-label="Skills it knows">
          <h3 className="mb-2 text-sm font-medium">Skills it knows <span className="ml-1 font-normal text-ink-3">{known.length}</span></h3>
          {known.length === 0 ? <p className="text-sm text-ink-3">None yet.</p> : (
            <Paged items={known} page={SKILL_PAGE} className={LIST} list
              render={(g) => <SkillRow key={g.sceneId} group={g} robots={robots} onOpen={() => onChange({ view: "skills", open: g.sceneId })} />} />
          )}
        </section>
        <section aria-label="Its runs">
          <h3 className="mb-2 text-sm font-medium">Recent runs</h3>
          <RunList filter={{ robot_id: robot.robot_id }} robots={robots} layoutName={layoutName} onOpen={(run) => onChange({ run })} />
        </section>
      </div>
      {passport.error && <ErrorNote message={passport.error} />}
      {passport.data && (
        <Disclosure summary="Technical sheet" hint="joint limits, motors, workspace">
          <PassportView passport={passport.data} />
        </Disclosure>
      )}
    </div>
  );
}
