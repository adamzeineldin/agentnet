"use client";

import Link from "next/link";
import type { TaskTypeInfo } from "@/lib/tasks";
import type { ExperienceCapsule, RobotSummary } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { RunDialog } from "../history/RunDialog";
import { RUN_KIND } from "../history/runKinds";
import { groupByTask } from "../skills/grouping";
import { ErrorNote, Loading, PageHeader } from "../ui";
import { FilterBar } from "./FilterBar";
import { layoutTitle, type LibraryQuery, type LibraryView, type RunResult, type SkillOrigin } from "./query";
import { RobotsView } from "./RobotsView";
import { RunsView } from "./RunsView";
import { SkillsView } from "./SkillsView";
import { useLibraryQuery } from "./useLibraryQuery";

const SKILLS_REFRESH_MS = 10000;
const ORIGINS: [SkillOrigin, string][] = [["all", "Any origin"], ["own", "Learned itself"], ["learned", "Learned from another robot"]];
const RESULTS: [RunResult, string][] = [["all", "Any result"], ["running", "Running"], ["succeeded", "Passed"], ["failed", "Failed"]];
const VIEWS: [LibraryView, string][] = [["skills", "Skills"], ["runs", "Runs"], ["robots", "Robots"]];

function Segmented<T extends string>({ label, options, value, onPick }: {
  label: string; options: [T, string][]; value: T; onPick: (value: T) => void;
}) {
  return (
    // One row that scrolls sideways on phones; a wrapped pill turns into a tall oval.
    <div className="segmented max-w-full flex-nowrap! overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label={label}>
      {options.map(([v, text]) => <button key={v} role="tab" aria-selected={value === v} onClick={() => onPick(v)}
        className="shrink-0 whitespace-nowrap">{text}</button>)}
    </div>
  );
}

function ViewFilters({ query, update }: { query: LibraryQuery; update: (patch: Partial<LibraryQuery>) => void }) {
  if (query.view === "skills") {
    return <Segmented label="Where the skill came from" options={ORIGINS} value={query.origin} onPick={(origin) => update({ origin })} />;
  }
  const kinds: [string, string][] = [["all", "Every type"], ...Object.entries(RUN_KIND).map(([k, v]): [string, string] => [k, v.filter])];
  return (
    <>
      <Segmented label="Run type" options={kinds} value={query.kind ?? "all"} onPick={(k) => update({ kind: k === "all" ? null : k })} />
      <Segmented label="Run result" options={RESULTS} value={query.result} onPick={(result) => update({ result })} />
    </>
  );
}

/**
 * Skills, the runs behind them and the robots that made them, in one place: Skills and Runs share one set of filters,
 * every skill links to its runs and back, and picking a robot carries over as the robot filter.
 */
export function Library() {
  const { query, update } = useLibraryQuery();
  const robots = useApi<RobotSummary[]>("/api/robots");
  const skills = useApi<ExperienceCapsule[]>("/api/skills", SKILLS_REFRESH_MS);
  const tasks = useApi<TaskTypeInfo[]>("/api/tasks");
  const layoutName = (sceneId: string) => layoutTitle(sceneId, tasks.data);
  const taskCount = skills.data && robots.data ? groupByTask(skills.data, robots.data).length : null;
  const error = robots.error || skills.error;
  // Paging restarts whenever the backend filters change.
  const runsKey = [query.kind, query.result, query.robot, query.task, query.layout].join("|");

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Shared memory" title="Library" actions={<Link href="/lab" className="button-primary">Open the Lab</Link>}>
        Every robot, every skill it has learned, and every run behind them.
      </PageHeader>
      <div className="segmented w-fit" role="tablist" aria-label="Library view">
        {VIEWS.map(([view, label]) => (
          <button key={view} role="tab" aria-selected={query.view === view} onClick={() => update({ view })}>
            {label}
            {view === "skills" && taskCount !== null && <span className="ml-1.5 opacity-60">{taskCount}</span>}
            {view === "robots" && robots.data && <span className="ml-1.5 opacity-60">{robots.data.length}</span>}
          </button>
        ))}
      </div>
      {error && <ErrorNote message={error} />}
      {robots.data && query.view !== "robots" && (
        <FilterBar query={query} robots={robots.data} tasks={tasks.data} onChange={update}
          placeholder={query.view === "skills" ? "Search tasks, robots, routes…" : "Search runs by task, robot or id…"}>
          <ViewFilters query={query} update={update} />
        </FilterBar>
      )}
      {!robots.data && !error && <Loading />}
      {robots.data && query.view === "skills" && (skills.data
        ? <SkillsView skills={skills.data} robots={robots.data} tasks={tasks.data} query={query} onChange={update} />
        : !error && <Loading label="Loading skills…" />)}
      {robots.data && query.view === "robots" && (
        <RobotsView robots={robots.data} selected={query.robot} onChange={update} onFleetChanged={robots.reload} />
      )}
      {robots.data && query.view === "runs" && (
        <RunsView key={runsKey} robots={robots.data} query={query} layoutName={layoutName} onOpen={(run) => update({ run })} />
      )}
      {query.run && (
        <RunDialog key={query.run} runId={query.run} robots={robots.data ?? []} onClose={() => update({ run: null })}
          onShowSkill={(sceneId) => update({ view: "skills", layout: sceneId, run: null })} />
      )}
    </div>
  );
}
