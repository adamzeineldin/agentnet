"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { apiUrl, enableRobot } from "@/lib/api";
import { fmtMetres } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { CatalogEntry, RobotPassport, RobotSummary } from "@/lib/types";
import { ActButton } from "./auth/SignIn";
import { PassportView } from "./PassportView";
import { Term } from "./Term";
import { Disclosure, ErrorNote, Loading, PageHeader, Panel } from "./ui";

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
        <div className="text-xs text-ink-3">{robot.maker} · {robot.dof} joints · reaches {fmtMetres(robot.max_reach_m)}</div>
      </div>
    </button>
  );
}

function AtAGlance({ robot, passport }: { robot: RobotSummary; passport: RobotPassport | null }) {
  const reach = passport?.capabilities.find((c) => c.task_type === "obstacle_aware_reach" && c.status === "verified_in_sim");
  const learned = Number(reach?.evidence.verified_skills ?? 0);
  return (
    <Panel title={robot.display_name.replace(/^Robot [AB] · /, "")}>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-ink-3">Joints</dt><dd>{robot.dof} that can move</dd></div>
        <div><dt className="text-xs text-ink-3">Reach</dt><dd>about {fmtMetres(robot.max_reach_m)} from its shoulder</dd></div>
        <div><dt className="text-xs text-ink-3">Hand</dt><dd>{handName(robot.tool_type)}</dd></div>
        <div><dt className="text-xs text-ink-3">Skills it has learned</dt><dd>{passport ? learned : "…"}</dd></div>
      </dl>
      <p className="mt-4 text-xs text-ink-3">
        Simulated from the official {robot.maker} model in MuJoCo Menagerie
        {robot.controller === "ursim" && "; its paths can also be checked on Universal Robots' URSim controller software"}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/transfer?source=${robot.robot_id}`} className="button-primary">Teach it a task</Link>
        <Link href={`/transfer?target=${robot.robot_id}`} className="button-secondary">Have it learn from another arm</Link>
      </div>
    </Panel>
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
      <PageHeader eyebrow="The robots" title="Robots" here="/robots">
        The robot arms Nimbotics can use. Each is simulated from its maker&apos;s official model, and every fact about it
        is either read from that model or measured in simulation (its <Term id="passport">passport</Term>).
      </PageHeader>
      <section aria-label="Fleet" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {robots.data?.map((r) => <FleetCard key={r.robot_id} robot={r} selected={r.robot_id === selected} onSelect={() => select(r.robot_id)} />)}
      </section>
      {robot && <AtAGlance robot={robot} passport={current.data} />}
      {current.error && <ErrorNote message={current.error} />}
      {current.data && (
        <Disclosure summary="Full passport" hint="joint limits, motors, workspace and a motion test">
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
