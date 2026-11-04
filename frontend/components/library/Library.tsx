"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { familyOf, type TaskTypeInfo } from "@/lib/tasks";
import type { ExperienceCapsule, RobotSummary } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { RunDialog } from "../history/RunDialog";
import { groupByTask, type TaskGroup } from "../skills/grouping";
import { ErrorNote, Loading } from "../ui";
import { Filters, SPREADS } from "./Filters";
import {
  layoutTitle, matchesSearch, taskTypeTitle, type LibraryQuery, type LibraryView,
} from "./query";
import { RobotsView, sortRobots } from "./RobotsView";
import { SearchBox, type Suggestion, type Token } from "./SearchBox";
import { keepSkill, SkillsView, sortSkills } from "./SkillsView";
import { useLibraryQuery } from "./useLibraryQuery";

const SKILLS_REFRESH_MS = 10000;
const MAX_SUGGESTIONS = 4;
const VIEWS: [LibraryView, string][] = [["skills", "Skills"], ["robots", "Robots"]];
const PLACEHOLDER: Record<LibraryView, string> = {
  skills: "Search skills, or type a robot or task type to filter…",
  robots: "Search robots by name or maker, or type a task type…",
};

/** Robots and task types whose names contain the text, the ones in use first. */
function suggestionsFor(text: string, view: LibraryView, robots: RobotSummary[], tasks: TaskTypeInfo[], groups: TaskGroup[],
  query: LibraryQuery): Suggestion[] {
  const skillsIn = (family: string) => groups.filter((g) => familyOf(g.sceneId) === family).length;
  const robotHits = view === "robots" ? [] : robots
    .filter((r) => r.robot_id !== query.robot && matchesSearch(text, [r.short_name, r.display_name, r.maker]))
    .slice(0, MAX_SUGGESTIONS)
    .map((r): Suggestion => ({ kind: "robot", id: r.robot_id, label: r.short_name, hint: r.maker }));
  const taskHits = tasks
    .filter((t) => t.family !== query.task && matchesSearch(text, [t.title]))
    .sort((a, b) => skillsIn(b.family) - skillsIn(a.family))
    .slice(0, MAX_SUGGESTIONS)
    .map((t): Suggestion => ({ kind: "task", id: t.family, label: t.title, hint: `${skillsIn(t.family)} skills` }));
  return [...robotHits, ...taskHits];
}

/**
 * One shared library of skills and robots (runs open from a skill or robot page), built to stay usable at thousands of each: a single search that turns
 * robots and task types into filter tokens, a Filters panel and Sort menu for the fixed choices, and paged or collapsed lists everywhere.
 */
export function Library() {
  const { query, update } = useLibraryQuery();
  const { user } = useAuth();
  const robots = useApi<RobotSummary[]>("/api/robots");
  const skills = useApi<ExperienceCapsule[]>("/api/skills", SKILLS_REFRESH_MS);
  const tasks = useApi<TaskTypeInfo[]>("/api/tasks");
  const layoutName = (sceneId: string) => layoutTitle(sceneId, tasks.data);
  const error = robots.error || skills.error;
  // Every robot stays known for names; "Mine" narrows what is listed to the viewer's own skills and uploads.
  const mineOnly = query.who === "mine" && user !== null;
  const allRobots = robots.data ?? [];
  const fleet = mineOnly ? allRobots.filter((r) => r.mine) : allRobots;
  const name = (id: string) => allRobots.find((r) => r.robot_id === id)?.short_name ?? id;
  const groups = skills.data ? groupByTask(mineOnly ? skills.data.filter((s) => s.mine) : skills.data, allRobots) : [];
  const shownSkills = sortSkills(groups.filter((g) => keepSkill(g, query, tasks.data, name)), query.sort);
  const knowsTask = (id: string) => !query.task
    || groups.some((g) => familyOf(g.sceneId) === query.task && g.byRobot.some((b) => b.robotId === id));
  const shownRobots = sortRobots(fleet.filter((r) => knowsTask(r.robot_id)
    && matchesSearch(query.q, [r.short_name, r.display_name, r.maker])), groups, query.sort);
  const counts: Partial<Record<LibraryView, number>> = skills.data && robots.data
    ? { skills: shownSkills.length, robots: shownRobots.length } : {};

  const tokens: Token[] = [
    query.robot && query.view !== "robots" && { key: "robot", label: name(query.robot), onRemove: () => update({ robot: null }) },
    query.task && { key: "task", label: taskTypeTitle(query.task, tasks.data), onRemove: () => update({ task: null }) },
    query.spread !== "all" && query.view === "skills" && {
      key: "spread", label: SPREADS.find(([v]) => v === query.spread)?.[1] ?? query.spread, onRemove: () => update({ spread: "all" }),
    },
  ].filter((t): t is Token => !!t);
  const pick = (s: Suggestion) => update(s.kind === "robot"
    ? { robot: s.id, q: "", open: null }
    : { task: s.id, q: "", open: null });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[28px] font-normal tracking-[-0.02em]">Library</h1>
        <Link href="/lab" className="button-primary">Open the Lab</Link>
      </div>
      <SearchBox value={query.q} placeholder={PLACEHOLDER[query.view]} tokens={tokens} onPick={pick}
        onChange={(q) => update({ q, open: null })}
        suggest={(text) => suggestionsFor(text, query.view, fleet, tasks.data ?? [], groups, query)} />
      {/* Over the list so the Filters and Sort panels open on top of it, under the search suggestions (z-20). */}
      <div className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="segmented w-fit" role="tablist" aria-label="Library view">
          {VIEWS.map(([view, label]) => (
            <button key={view} role="tab" aria-selected={query.view === view} onClick={() => update({ view, open: null })}>
              {label}{counts[view] !== undefined && <span className="ml-1.5 opacity-60">{counts[view]}</span>}
            </button>
          ))}
        </div>
        {!query.open && <Filters query={query} update={update} signedIn={user !== null} robots={fleet} tasks={tasks.data ?? []} />}
      </div>
      {error && <ErrorNote message={error} />}
      {!robots.data && !error && <Loading />}
      {robots.data && query.view === "skills" && (skills.data
        ? <SkillsView groups={groups} shown={shownSkills} robots={robots.data} tasks={tasks.data} query={query} onChange={update}
            onShared={skills.reload} />
        : !error && <Loading label="Loading skills…" />)}
      {robots.data && query.view === "robots" && (
        <RobotsView robots={allRobots} shown={shownRobots} groups={groups} layoutName={layoutName} query={query}
          onChange={update} onFleetChanged={robots.reload} mineOnly={mineOnly} />
      )}
      {query.run && (
        <RunDialog key={query.run} runId={query.run} robots={robots.data ?? []} onClose={() => update({ run: null })}
          onShowSkill={(sceneId) => update({ view: "skills", open: sceneId, run: null })} />
      )}
    </div>
  );
}
