"use client";

import Link from "next/link";
import { familyOf, type TaskTypeInfo } from "@/lib/tasks";
import type { ExperienceCapsule, RobotSummary } from "@/lib/types";
import { groupByTask, type TaskGroup } from "../skills/grouping";
import { LibrarianStrip } from "../skills/LibrarianStrip";
import { TaskCard } from "../skills/TaskCard";
import { routePhrase } from "../transfer/describe";
import { layoutTitle, matchesSearch, type LibraryQuery } from "./query";

interface SkillsViewProps {
  skills: ExperienceCapsule[];
  robots: RobotSummary[];
  tasks: TaskTypeInfo[] | null;
  query: LibraryQuery;
  onChange: (patch: Partial<LibraryQuery>) => void;
}

function keep(g: TaskGroup, q: LibraryQuery, tasks: TaskTypeInfo[] | null, name: (id: string) => string): boolean {
  if (q.layout && g.sceneId !== q.layout) return false;
  if (q.task && familyOf(g.sceneId) !== q.task) return false;
  // Robot and origin are judged on the same row: "the UR5e learned it from another robot".
  const rows = g.byRobot.filter((b) => (!q.robot || b.robotId === q.robot)
    && (q.origin === "all" || (q.origin === "learned") === !!b.latest.parent_skill_id));
  if (rows.length === 0) return false;
  return matchesSearch(q.q, [layoutTitle(g.sceneId, tasks), ...g.byRobot.flatMap((b) => [
    name(b.robotId), routePhrase(`${b.latest.strategy.route_class}@${b.latest.strategy.clearance_m}`),
  ])]);
}

/** Every saved skill, one card per task layout; each card leads to the runs behind it. */
export function SkillsView({ skills, robots, tasks, query, onChange }: SkillsViewProps) {
  const name = (id: string) => robots.find((r) => r.robot_id === id)?.short_name ?? id;
  const groups = groupByTask(skills, robots);
  const visible = groups.filter((g) => keep(g, query, tasks, name));
  const unfiltered = !query.robot && !query.task && !query.layout && !query.q.trim() && query.origin === "all";

  if (skills.length === 0) {
    return <p className="soft-card p-8 text-sm text-ink-3">Nothing learned yet. <Link href="/lab" className="text-accent">Teach a robot its first task →</Link></p>;
  }
  return (
    <div className="space-y-4">
      {unfiltered && <LibrarianStrip skills={skills} robotName={name} />}
      {visible.length === 0 && (
        <p className="soft-card p-8 text-sm text-ink-3">
          {query.robot && !query.task && !query.q.trim() && query.origin === "all"
            ? <>The {name(query.robot)} hasn&apos;t learned anything yet.{" "}
              <Link href={`/lab?target=${query.robot}`} className="text-accent">Let it learn from another robot →</Link></>
            : "No skills match these filters."}
        </p>
      )}
      {visible.map((g) => (
        <TaskCard key={g.sceneId} group={g} robots={robots} robotName={name}
          onShowRuns={() => onChange({ view: "runs", layout: g.sceneId, kind: null, result: "all" })}
          onOpenRun={(run) => onChange({ run })} />
      ))}
    </div>
  );
}
