"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { apiUrl, enableRobot } from "@/lib/api";
import { fmtMetres } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { CatalogEntry, ExperienceCapsule, RobotPassport, RobotSummary } from "@/lib/types";
import { ActButton } from "../auth/SignIn";
import { PassportView } from "../PassportView";
import { UploadRobot } from "../robots/UploadRobot";
import { Disclosure, ErrorNote } from "../ui";
import type { LibraryQuery } from "./query";

/** Catalog tool_type ("parallel_gripper_held_open (not used for reach)", "none (bare tool flange)") in plain words. */
function handName(toolType: string): string {
  if (toolType.startsWith("none")) return "no hand, bare flange";
  return toolType.replace(/_/g, " ").replace(/\s*\(.*\)$/, "");
}

function FleetCard({ robot, selected, onSelect }: { robot: RobotSummary; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} className="soft-card overflow-hidden text-left">
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the backend from MuJoCo state */}
      <img src={apiUrl(robot.snapshot_url)} alt={`${robot.short_name} rendered in MuJoCo at its home pose`}
        className="aspect-[4/3] w-full bg-panel-2 object-cover" />
      <div className="p-3.5">
        <div className="font-medium">{robot.short_name}</div>
        <div className="text-xs text-ink-3">{robot.maker}</div>
      </div>
    </button>
  );
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

function AtAGlance({ robot, onChange }: { robot: RobotSummary; onChange: (patch: Partial<LibraryQuery>) => void }) {
  const skills = useApi<ExperienceCapsule[]>(`/api/skills?source_robot_id=${robot.robot_id}`);
  // Count tasks, not saves: the same task saved twice is still one thing it can do (as in the Library).
  const tasks = (adapted: boolean) => new Set(skills.data?.filter((s) => !!s.parent_skill_id === adapted).map((s) => s.task.scene_id)).size;
  const own = tasks(false);
  const adapted = tasks(true);
  return (
    <section aria-label={`About the ${robot.short_name}`} className="soft-card grid gap-6 overflow-hidden p-5 md:grid-cols-[minmax(0,22rem)_1fr] md:p-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the backend from MuJoCo state */}
      <img src={apiUrl(robot.snapshot_url)} alt={`${robot.short_name} in the simulator`} className="aspect-[4/3] w-full rounded-xl bg-panel-2 object-cover" />
      <div className="min-w-0 space-y-5">
        <div>
          <h2 className="text-2xl font-light tracking-[-0.02em]">{robot.display_name.replace(/^Robot [AB] · /, "")}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-2">
            <span className="rounded-full bg-panel-2 px-2.5 py-1">{robot.model_source.startsWith("uploaded") ? "Uploaded model" : `${robot.maker} model`}</span>
            <span className="rounded-full bg-panel-2 px-2.5 py-1" title="Tasks here only move the hand to a point, so no gripping.">{handName(robot.tool_type)}</span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact label="Joints" value={robot.dof} meaning="Motors that can turn. More joints means more ways to reach the same spot." />
          <Fact label="Reach" value={fmtMetres(robot.max_reach_m)} meaning="How far its hand can get from its shoulder." />
          <Fact label="Learned itself" value={skills.data ? own : "…"} meaning="Tasks it worked out by itself." />
          <Fact label="From others" value={skills.data ? adapted : "…"} meaning="Tasks it learned from another robot." />
        </dl>
        <div className="flex flex-wrap gap-2">
          <Link href={`/lab?source=${robot.robot_id}`} className="button-primary">Teach it something</Link>
          <Link href={`/lab?target=${robot.robot_id}`} className="button-secondary">Let it learn from another robot</Link>
          <button type="button" onClick={() => onChange({ view: "skills", robot: robot.robot_id })} className="button-secondary">See its skills</button>
          <button type="button" onClick={() => onChange({ view: "runs", robot: robot.robot_id })} className="button-secondary">See its runs</button>
        </div>
      </div>
    </section>
  );
}

function Catalog({ entries, onAdded }: { entries: CatalogEntry[]; onAdded: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = entries.filter((e) => !e.in_fleet);
  if (available.length === 0) return <p className="text-sm text-ink-3">Every arm in the catalog is already in the fleet.</p>;
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
  robots: RobotSummary[];
  /** The robot shown in detail: the library's robot filter, or the first arm when none is set. */
  selected: string | null;
  onChange: (patch: Partial<LibraryQuery>) => void;
  /** A robot joined the fleet: reload the shared robot list. */
  onFleetChanged: () => void;
}

/** The fleet: pick an arm to see what it is (picking also sets the robot filter for Skills and Runs), or add one. */
export function RobotsView({ robots, selected, onChange, onFleetChanged }: RobotsViewProps) {
  const catalog = useApi<CatalogEntry[]>("/api/robots/catalog");
  const shownId = selected && robots.some((r) => r.robot_id === selected) ? selected : robots[0]?.robot_id ?? null;
  const current = useApi<RobotPassport>(shownId ? `/api/robots/${shownId}` : null);
  const robot = robots.find((r) => r.robot_id === shownId);
  const added = (id: string) => {
    onFleetChanged();
    catalog.reload();
    onChange({ robot: id });
  };

  return (
    <div className="space-y-8">
      <section aria-label="Fleet" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {robots.map((r) => <FleetCard key={r.robot_id} robot={r} selected={r.robot_id === shownId} onSelect={() => onChange({ robot: r.robot_id })} />)}
      </section>
      {robot && <AtAGlance robot={robot} onChange={onChange} />}
      {current.error && <ErrorNote message={current.error} />}
      {current.data && (
        <Disclosure summary="Technical sheet" hint="joint limits, motors, workspace">
          <PassportView passport={current.data} />
        </Disclosure>
      )}
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-normal tracking-[-0.01em]">Add a robot</h2>
          <p className="mt-1 text-sm text-ink-3">From MuJoCo Menagerie, or upload your own.</p>
        </div>
        {catalog.error && <ErrorNote message={catalog.error} />}
        {catalog.data && <Catalog entries={catalog.data} onAdded={added} />}
        <UploadRobot onAdded={added} />
      </section>
    </div>
  );
}
