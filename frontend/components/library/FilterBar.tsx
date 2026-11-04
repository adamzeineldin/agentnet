"use client";

import { useState, type ReactNode } from "react";
import type { TaskTypeInfo } from "@/lib/tasks";
import type { RobotSummary } from "@/lib/types";
import { layoutTitle, type LibraryQuery } from "./query";

interface FilterBarProps {
  query: LibraryQuery;
  robots: RobotSummary[];
  tasks: TaskTypeInfo[] | null;
  placeholder: string;
  onChange: (patch: Partial<LibraryQuery>) => void;
  /** Filters that only one view has (run type and result, or where a skill came from). */
  children?: ReactNode;
}

const CHIP = "rounded-full border px-3 py-1.5 text-xs transition-colors";
const chip = (on: boolean) => `${CHIP} ${on ? "border-ink bg-ink text-bg" : "border-line-strong text-ink-2 hover:border-ink"}`;

/** Search, robot and task type: the filters both views share, so switching views keeps what you narrowed down. */
export function FilterBar({ query, robots, tasks, placeholder, onChange, children }: FilterBarProps) {
  // The box keeps its own text so typing never waits for the URL; "Clear" remounts it empty.
  const [resets, setResets] = useState(0);
  const filtered = query.robot || query.task || query.layout || query.q.trim() || query.origin !== "all"
    || query.kind || query.result !== "all";
  const clear = () => {
    setResets((n) => n + 1);
    onChange({ robot: null, task: null, layout: null, q: "", origin: "all", kind: null, result: "all" });
  };
  return (
    <section aria-label="Filters" className="soft-card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[14rem] flex-1">
          <span className="sr-only">Search</span>
          <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">⌕</span>
          <input key={resets} type="search" defaultValue={query.q} placeholder={placeholder} maxLength={80}
            onChange={(e) => onChange({ q: e.target.value })}
            className="w-full border border-line-strong bg-panel py-2 pl-8 pr-3 text-sm text-ink" />
        </label>
        <select aria-label="Task type" value={query.task ?? ""} onChange={(e) => onChange({ task: e.target.value || null, layout: null })}
          className="max-w-full border border-line-strong bg-panel px-3 py-2 text-sm text-ink">
          <option value="">Every task type</option>
          {(tasks ?? []).map((t) => <option key={t.family} value={t.family}>{t.title}</option>)}
        </select>
        {filtered && <button type="button" onClick={clear} className="text-xs text-accent hover:underline">Clear</button>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Robot">
        <button type="button" aria-pressed={!query.robot} onClick={() => onChange({ robot: null })} className={chip(!query.robot)}>All robots</button>
        {robots.map((r) => (
          <button key={r.robot_id} type="button" aria-pressed={query.robot === r.robot_id}
            onClick={() => onChange({ robot: query.robot === r.robot_id ? null : r.robot_id })} className={chip(query.robot === r.robot_id)}>
            {r.short_name}
          </button>
        ))}
        {query.layout && (
          <button type="button" onClick={() => onChange({ layout: null })} aria-label="Stop showing only this layout"
            className={`${CHIP} ml-auto border-accent text-accent hover:bg-accent/5`}>
            {layoutTitle(query.layout, tasks)} ✕
          </button>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">{children}</div>}
    </section>
  );
}
