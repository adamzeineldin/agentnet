"use client";

import { useState } from "react";
import type { RobotSummary, RunRecord } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { ErrorNote, Loading } from "../ui";
import { RunCard, robotsLabel, runKindTitle } from "./RunCard";
import { matchesSearch, type LibraryQuery } from "./query";

const PAGE = 48;
const REFRESH_MS = 5000;

interface RunsViewProps {
  robots: RobotSummary[];
  query: LibraryQuery;
  layoutName: (sceneId: string) => string;
  onOpen: (runId: string) => void;
}

/** The API query for the filters the backend applies: type, result, robot, task type and layout. */
function runsPath(q: LibraryQuery, limit: number): string {
  const params = new URLSearchParams({ limit: String(limit), full: "false" });
  if (q.kind) params.set("run_type", q.kind);
  if (q.result !== "all") params.set("run_status", q.result);
  if (q.robot) params.set("robot_id", q.robot);
  if (q.layout) params.set("scene_id", q.layout);
  else if (q.task) params.set("family", q.task);
  return `/api/runs?${params}`;
}

/** Every stored run, failures included, newest first. Search narrows the loaded page by name, robot and task. */
export function RunsView({ robots, query, layoutName, onOpen }: RunsViewProps) {
  const [shown, setShown] = useState(PAGE);
  const runs = useApi<RunRecord[]>(runsPath(query, shown), REFRESH_MS);
  const name = (id: string) => robots.find((r) => r.robot_id === id)?.short_name ?? id;
  const visible = (runs.data ?? []).filter((r) => matchesSearch(query.q, [
    runKindTitle(r), robotsLabel(r, name), r.results.scene_id ? layoutName(String(r.results.scene_id)) : null, r.run_id, r.status,
  ]));
  const more = (runs.data?.length ?? 0) >= shown;

  return (
    <div className="space-y-4">
      {runs.error && <ErrorNote message={runs.error} />}
      {runs.loading && !runs.data && <Loading label="Loading runs…" />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,270px),1fr))] gap-4">
        {visible.map((r) => <RunCard key={r.run_id} run={r} name={name} layoutName={layoutName} onOpen={() => onOpen(r.run_id)} />)}
      </div>
      {runs.data && visible.length === 0 && <p className="soft-card p-8 text-center text-sm text-ink-3">No runs match these filters.</p>}
      {more && (
        <div className="text-center">
          <button onClick={() => setShown((n) => n + PAGE)} className="pill">Show {PAGE} more</button>
        </div>
      )}
    </div>
  );
}
