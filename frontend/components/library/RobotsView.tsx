"use client";

import { useState } from "react";
import { apiUrl, enableRobot } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { CatalogEntry, RobotSummary } from "@/lib/types";
import { ActButton } from "../auth/SignIn";
import { UploadRobot } from "../robots/UploadRobot";
import type { TaskGroup } from "../skills/grouping";
import { ErrorNote } from "../ui";
import type { LibraryQuery, LibrarySort } from "./query";
import { Paged } from "./Paged";
import { RobotPage } from "./RobotPage";
import { robotSkillCounts } from "./spread";
import { PrivateBadge } from "./Visibility";

const PAGE = 24;

/** Newest first, or the robots that know the most skills first. */
export function sortRobots(robots: RobotSummary[], groups: TaskGroup[], sort: LibrarySort): RobotSummary[] {
  const known = (id: string) => {
    const { own, learned } = robotSkillCounts(groups, id);
    return own + learned;
  };
  return [...robots].sort((a, b) => sort === "most"
    ? known(b.robot_id) - known(a.robot_id) || a.short_name.localeCompare(b.short_name)
    : b.created_at.localeCompare(a.created_at));
}

function FleetCard({ robot, skills, onOpen }: { robot: RobotSummary; skills: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`Open the ${robot.short_name}`} className="soft-card overflow-hidden text-left">
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the backend from the loaded model */}
      <img src={apiUrl(robot.snapshot_url)} alt="" className="aspect-[4/3] w-full bg-panel-2 object-cover" />
      <div className="flex items-baseline justify-between gap-2 p-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{robot.short_name}</span>
            {robot.visibility === "private" && <PrivateBadge />}
          </div>
          <div className="truncate text-xs text-ink-3">{robot.maker}</div>
        </div>
        <span className="shrink-0 text-xs text-ink-3">{skills} {skills === 1 ? "skill" : "skills"}</span>
      </div>
    </button>
  );
}

function Catalog({ entries, onAdded }: { entries: CatalogEntry[]; onAdded: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = entries.filter((e) => !e.in_fleet);
  if (available.length === 0) return null;
  async function add(id: string) {
    setBusy(id);
    setError(null);
    try {
      await enableRobot(id);
      onAdded(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-3">
      {error && <ErrorNote message={error} />}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {available.map((e) => (
          <li key={e.robot_id} className="soft-card flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="font-medium">{e.display_name}</div>
              <div className="truncate text-xs text-ink-3" title={e.model_source}>{e.maker}</div>
            </div>
            <ActButton onClick={() => void add(e.robot_id)} disabled={busy !== null} aria-label={`Add ${e.short_name} to the fleet`}
              className="pill shrink-0 text-xs disabled:opacity-50">
              {busy === e.robot_id ? "Measuring…" : "+ Add"}
            </ActButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface RobotsViewProps {
  /** Every robot in the fleet (for the robot page). */
  robots: RobotSummary[];
  /** The robots that pass the search, sorted. */
  shown: RobotSummary[];
  groups: TaskGroup[];
  layoutName: (sceneId: string) => string;
  query: LibraryQuery;
  onChange: (patch: Partial<LibraryQuery>) => void;
  /** A robot joined the fleet: reload the shared robot list. */
  onFleetChanged: () => void;
}

/** The fleet as paged cards; opening one shows the robot's page. Adding a robot sits behind one button. */
export function RobotsView({ robots, shown, groups, layoutName, query, onChange, onFleetChanged }: RobotsViewProps) {
  const [adding, setAdding] = useState(false);
  const catalog = useApi<CatalogEntry[]>(adding ? "/api/robots/catalog" : null);
  const opened = query.open ? robots.find((r) => r.robot_id === query.open) : undefined;
  if (opened) {
    return <RobotPage robot={opened} robots={robots} groups={groups} layoutName={layoutName} onChange={onChange}
      onShared={onFleetChanged} />;
  }

  // A catalog arm opens its page; an upload stays put so its report (what Nimbotics completed) stays readable.
  const added = (id: string) => {
    onFleetChanged();
    catalog.reload();
    setAdding(false);
    onChange({ open: id });
  };
  // A changed search or sort starts from the first page again.
  const listKey = `${query.q}|${query.sort}`;
  const count = (id: string) => {
    const { own, learned } = robotSkillCounts(groups, id);
    return own + learned;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button type="button" aria-expanded={adding} onClick={() => setAdding((a) => !a)} className="pill text-xs">
          {adding ? "Close" : "+ Add a robot"}
        </button>
      </div>
      {adding && (
        <section aria-label="Add a robot" className="space-y-3">
          {catalog.error && <ErrorNote message={catalog.error} />}
          {catalog.data && <Catalog entries={catalog.data} onAdded={added} />}
          <UploadRobot onAdded={onFleetChanged} />
        </section>
      )}
      {shown.length === 0 ? <p className="soft-card p-8 text-center text-sm text-ink-3">No robots match.</p> : (
        <section aria-label="Fleet">
          <Paged key={listKey} items={shown} page={PAGE} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-4"
            render={(r) => <FleetCard key={r.robot_id} robot={r} skills={count(r.robot_id)} onOpen={() => onChange({ open: r.robot_id })} />} />
        </section>
      )}
    </div>
  );
}
