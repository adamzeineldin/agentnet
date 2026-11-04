"use client";

import type { ReactNode } from "react";
import type { TaskTypeInfo } from "@/lib/tasks";
import type { RobotSummary } from "@/lib/types";
import { Popover, RadioList } from "./Popover";
import type { LibraryQuery, LibrarySort, LibraryWho, SkillSpread } from "./query";

const ANY = "";
export const SPREADS: [SkillSpread, string][] = [["all", "Any number of robots"], ["shared", "Shared by several robots"], ["single", "Just one robot"]];
const WHOS: [LibraryWho, string][] = [["everyone", "All"], ["mine", "My library"]];
const SORTS: Record<LibraryQuery["view"], [LibrarySort, string][]> = {
  skills: [["newest", "Newest"], ["most", "Most robots"]],
  robots: [["newest", "Newest"], ["most", "Most skills"]],
};

interface FiltersProps {
  query: LibraryQuery;
  update: (patch: Partial<LibraryQuery>) => void;
  /** "My library" needs an account. */
  signedIn: boolean;
  robots: RobotSummary[];
  tasks: TaskTypeInfo[];
}

/** How many filters in the panel differ from "everything" for the current view. */
export function activeFilters(query: LibraryQuery): number {
  const skills = query.view === "skills";
  return [skills && query.robot, query.task, skills && query.spread !== "all"].filter(Boolean).length;
}

/** All or My library as a quiet toggle, then one Filters panel and one Sort menu instead of a row of chips per choice. */
export function Filters({ query, update, signedIn, robots, tasks }: FiltersProps) {
  return (
    // Never narrower than its contents: on a phone it wraps under the view tabs rather than spilling off the page.
    <div className="flex flex-1 flex-wrap items-center gap-2">
      {signedIn && <WhoToggle value={query.who} onPick={(who) => update({ who })} />}
      <div className="ml-auto flex items-center gap-2">
        <FilterPanel query={query} update={update} robots={robots} tasks={tasks} />
        <SortMenu query={query} update={update} />
      </div>
    </div>
  );
}

function WhoToggle({ value, onPick }: { value: LibraryWho; onPick: (who: LibraryWho) => void }) {
  return (
    <div role="radiogroup" aria-label="Whose" className="flex rounded-full border border-line bg-panel-2 p-[3px] text-xs">
      {WHOS.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onPick(v)}
          className={`whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
            value === v ? "bg-panel text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-ink-3 hover:text-ink"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

function FilterPanel({ query, update, robots, tasks }: Omit<FiltersProps, "signedIn">) {
  const count = activeFilters(query);
  const skills = query.view === "skills";
  return (
    <Popover label="Filters" active={count > 0} align="right" buttonLabel={count ? `Filters, ${count} on` : "Filters"}
      button={<>Filters{count > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 text-bg">{count}</span>}</>}>
      {() => (
        <div className="space-y-3 p-1.5">
          {skills && (
            <Field label="Known by">
              <RadioList label="Known by" options={SPREADS} value={query.spread} onPick={(spread) => update({ spread })} />
            </Field>
          )}
          {skills && (
            <Field label="Robot" htmlFor="library-filter-robot">
              <select id="library-filter-robot" value={query.robot ?? ANY} onChange={(e) => update({ robot: e.target.value || null })}
                className="w-full border border-line bg-panel px-2.5 py-1.5 text-sm">
                <option value={ANY}>Any robot</option>
                {robots.map((r) => <option key={r.robot_id} value={r.robot_id}>{r.short_name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Task type" htmlFor="library-filter-task">
            <select id="library-filter-task" value={query.task ?? ANY} onChange={(e) => update({ task: e.target.value || null })}
              className="w-full border border-line bg-panel px-2.5 py-1.5 text-sm">
              <option value={ANY}>Any task type</option>
              {tasks.map((t) => <option key={t.family} value={t.family}>{t.title}</option>)}
            </select>
          </Field>
          <button type="button" disabled={count === 0} onClick={() => update({ robot: null, task: null, spread: "all" })}
            className="w-full rounded-xl px-2.5 py-1.5 text-left text-xs text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent">
            Clear filters
          </button>
        </div>
      )}
    </Popover>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      {htmlFor
        ? <label htmlFor={htmlFor} className="block px-1 text-[11px] text-ink-3">{label}</label>
        : <p className="px-1 text-[11px] text-ink-3">{label}</p>}
      {children}
    </div>
  );
}

function SortMenu({ query, update }: Pick<FiltersProps, "query" | "update">) {
  const options = SORTS[query.view];
  const current = options.find(([v]) => v === query.sort)?.[1] ?? options[0][1];
  return (
    <Popover label="Sort" align="right" buttonLabel={`Sort: ${current}`}
      button={<><span className="text-ink-3">Sort</span>{current}</>}>
      {(close) => <RadioList label="Sort" options={options} value={query.sort} onPick={(sort) => { update({ sort }); close(); }} />}
    </Popover>
  );
}
