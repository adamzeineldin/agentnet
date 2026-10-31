"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { apiUrl, enableRobot } from "@/lib/api";
import { fmtMetres } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { CatalogEntry, ExperienceCapsule, RobotPassport, RobotSummary } from "@/lib/types";
import { ActButton } from "./auth/SignIn";
import { PassportView } from "./PassportView";
import { Disclosure, ErrorNote, Loading, PageHeader } from "./ui";

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

function Fact({ label, value, meaning }: { label: string; value: ReactNode; meaning: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-lg">{value}</dd>
      <dd className="text-xs text-ink-3">{meaning}</dd>
    </div>
  );
}

function AtAGlance({ robot }: { robot: RobotSummary }) {
  const skills = useApi<ExperienceCapsule[]>(`/api/skills?source_robot_id=${robot.robot_id}`);
  // Count tasks, not saves: the same task saved twice is still one thing it can do (as on the Skills page).
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
          <p className="text-sm text-ink-3">Simulated from {robot.maker}&apos;s official model.</p>
        </div>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Fact label="Joints" value={robot.dof} meaning="Motors that can turn. More joints means more ways to reach the same spot." />
          <Fact label="Reach" value={fmtMetres(robot.max_reach_m)} meaning="How far its hand can get from its shoulder." />
          <Fact label="Hand" value={handName(robot.tool_type)} meaning="Tasks here only move the hand to a point, so no gripping." />
          <Fact label="What it has done" value={skills.data ? `${own} task${own === 1 ? "" : "s"} learned, ${adapted} picked up` : "…"}
            meaning="Tasks it worked out by itself, and tasks it learned from another robot." />
        </dl>
        <div className="flex flex-wrap gap-2">
          <Link href={`/transfer?source=${robot.robot_id}`} className="button-primary">Teach it something</Link>
          <Link href={`/transfer?target=${robot.robot_id}`} className="button-secondary">Let it learn from another robot</Link>
          <Link href={`/skills?robot=${robot.robot_id}`} className="button-secondary">See its skills</Link>
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

export function RobotFleet() {
  const robots = useApi<RobotSummary[]>("/api/robots");
  const catalog = useApi<CatalogEntry[]>("/api/robots/catalog");
  const params = useSearchParams();
  const router = useRouter();
  const ids = robots.data?.map((r) => r.robot_id) ?? [];
  const selected = params.get("robot") && ids.includes(params.get("robot")!) ? params.get("robot")! : ids[0] ?? null;
  const current = useApi<RobotPassport>(selected ? `/api/robots/${selected}` : null);
  const robot = robots.data?.find((r) => r.robot_id === selected);
  const select = (id: string) => router.replace(`/robots?robot=${id}`, { scroll: false });

  if (robots.error) return <ErrorNote message={robots.error} />;
  if (robots.loading) return <Loading label="Loading the fleet…" />;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="The robots" title="Robots">
        The robot arms in the simulator. Pick one to see what it is and what it has learned, or add another one below.
      </PageHeader>
      <section aria-label="Fleet" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {robots.data?.map((r) => <FleetCard key={r.robot_id} robot={r} selected={r.robot_id === selected} onSelect={() => select(r.robot_id)} />)}
      </section>
      {robot && <AtAGlance robot={robot} />}
      {current.error && <ErrorNote message={current.error} />}
      {current.data && (
        <Disclosure summary="Technical sheet" hint="for engineers: joint limits, motors, workspace and a motion test">
          <PassportView passport={current.data} />
        </Disclosure>
      )}
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-normal tracking-[-0.01em]">Add a robot</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            More arms from MuJoCo Menagerie. Adding one measures its reach from the model (a few seconds) and makes it
            available to everyone as a teacher or learner in Transfer Lab. Some arms are too small for the wall task, and
            their failures are shown honestly.
          </p>
        </div>
        {catalog.error && <ErrorNote message={catalog.error} />}
        {catalog.data && <Catalog entries={catalog.data} onAdded={(id) => { robots.reload(); catalog.reload(); select(id); }} />}
      </section>
    </div>
  );
}
