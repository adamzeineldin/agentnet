"use client";

import Link from "next/link";
import { familyOf, type TaskTypeInfo } from "@/lib/tasks";
import type { RobotSummary } from "@/lib/types";
import type { TaskGroup } from "../skills/grouping";
import { routePhrase } from "../transfer/describe";
import { Paged } from "./Paged";
import { layoutTitle, matchesSearch, taskTypeTitle, type LibraryQuery, type LibrarySort } from "./query";
import { LIST, SkillRow } from "./SkillList";
import { SkillPage } from "./SkillPage";

const PAGE = 50;
const SECTIONS = 8;
const PER_SECTION = 5;
/** Below this many skills one list reads better than sections by task type. */
const SECTIONS_FROM = 13;

/** Whether a skill passes the library's filters and search. */
export function keepSkill(g: TaskGroup, q: LibraryQuery, tasks: TaskTypeInfo[] | null, name: (id: string) => string): boolean {
  if (q.task && familyOf(g.sceneId) !== q.task) return false;
  if (q.robot && !g.byRobot.some((b) => b.robotId === q.robot)) return false;
  if (q.spread === "shared" && g.byRobot.length < 2) return false;
  if (q.spread === "single" && g.byRobot.length !== 1) return false;
  return matchesSearch(q.q, [layoutTitle(g.sceneId, tasks), ...g.byRobot.flatMap((b) => [
    name(b.robotId), routePhrase(`${b.latest.strategy.route_class}@${b.latest.strategy.clearance_m}`),
  ])]);
}

/** Newest first, or the skills the most robots know first. */
export function sortSkills(groups: TaskGroup[], sort: LibrarySort): TaskGroup[] {
  return [...groups].sort((a, b) => sort === "most"
    ? b.byRobot.length - a.byRobot.length || b.newest.localeCompare(a.newest)
    : b.newest.localeCompare(a.newest));
}

/** Skills by task type, each type's list in the order the skills already come in. */
function sectionsOf(groups: TaskGroup[]): { family: string; groups: TaskGroup[] }[] {
  const byFamily = new Map<string, TaskGroup[]>();
  for (const g of groups) byFamily.set(familyOf(g.sceneId), [...(byFamily.get(familyOf(g.sceneId)) ?? []), g]);
  return [...byFamily.entries()].map(([family, list]) => ({ family, groups: list }));
}

interface SkillsViewProps {
  /** Every skill, so an open skill shows even when the filters would hide it. */
  groups: TaskGroup[];
  /** The skills that pass the filters and search, sorted. */
  shown: TaskGroup[];
  robots: RobotSummary[];
  tasks: TaskTypeInfo[] | null;
  query: LibraryQuery;
  onChange: (patch: Partial<LibraryQuery>) => void;
  /** A skill was made public or private: reload the skills. */
  onShared: () => void;
}

/**
 * Skills as a plain list. A large library is split by task type, a few lines each with "See all"; a search, a task
 * type or a small library shows one paged list. Opening a skill shows the picture, who knows it and its runs.
 */
export function SkillsView({ groups, shown, robots, tasks, query, onChange, onShared }: SkillsViewProps) {
  const opened = query.open ? groups.find((g) => g.sceneId === query.open) : undefined;
  if (opened) return <SkillPage key={opened.sceneId} group={opened} robots={robots} onChange={onChange} onShared={onShared} />;
  const row = (g: TaskGroup) => <SkillRow key={g.sceneId} group={g} robots={robots} onOpen={() => onChange({ open: g.sceneId })} />;

  if (groups.length === 0) {
    return <p className="soft-card p-8 text-sm text-ink-3">Nothing learned yet. <Link href="/lab" className="text-accent">Teach a robot its first task →</Link></p>;
  }
  if (shown.length === 0) return <p className="soft-card p-8 text-center text-sm text-ink-3">No skills match.</p>;
  // A changed filter starts the list from its first page again.
  const listKey = [query.q, query.robot, query.task, query.spread, query.sort].join("|");
  if (query.task || query.q.trim() || shown.length < SECTIONS_FROM) {
    return <Paged key={listKey} items={shown} page={PAGE} className={LIST} list render={row} />;
  }
  return (
    <Paged key={listKey} items={sectionsOf(shown)} page={SECTIONS} className="space-y-6" render={(s) => {
      const title = taskTypeTitle(s.family, tasks);
      return (
        <section key={s.family} aria-label={title}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">{title} <span className="ml-1 font-normal text-ink-3">{s.groups.length}</span></h2>
            {s.groups.length > PER_SECTION && (
              <button type="button" onClick={() => onChange({ task: s.family })} className="text-xs text-accent hover:underline">
                See all {s.groups.length} →</button>
            )}
          </div>
          <ul className={LIST}>{s.groups.slice(0, PER_SECTION).map(row)}</ul>
        </section>
      );
    }} />
  );
}
