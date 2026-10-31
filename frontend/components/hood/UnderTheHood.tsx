"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { fmtM, fmtMetres } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type {
  CandidateSummary, Health, LibraryReport, ReasoningTrace, RobotSummary, RunRecord, SearchMetrics, SkillDetail, TaskSpec,
  Placement,
} from "@/lib/types";
import { routeName, skillName } from "../transfer/skillName";
import { Badge, EvidenceTag, ErrorNote, Loading, PageHeader, Stat } from "../ui";
import { PlacementSketch, TaskSketch } from "./Sketches";

const OUTCOME: Record<string, { text: string; tone: "good" | "bad" | "neutral" | "accent" }> = {
  verified: { text: "passed the physics test", tone: "good" },
  physics_failure: { text: "failed the physics test", tone: "bad" },
  feasible: { text: "possible, not needed", tone: "neutral" },
  not_simulated: { text: "possible, not needed", tone: "neutral" },
  collision: { text: "would hit something", tone: "bad" },
  insufficient_clearance: { text: "too close to the wall", tone: "bad" },
  unreachable: { text: "arm can't reach it", tone: "bad" },
  discontinuous_ik: { text: "arm would have to jump", tone: "bad" },
};

/** The offline prior's note (services/transfer.py prior_order) in plain words. */
function plainNote(note: string, teacher: string): string {
  if (note.startsWith("capsule strategy")) return `Exactly the route that worked for the ${teacher}`;
  if (note.startsWith("same route class")) return `Same kind of route as the ${teacher}'s, at a different distance from the wall`;
  if (note.startsWith("alternative verified")) return `Another route that also worked for the ${teacher}`;
  if (note.startsWith("kinematically feasible")) return `Was possible for the ${teacher}, but never tested`;
  if (note.startsWith("source: ")) return `Didn't work for the ${teacher} (${note.slice(8)})`;
  return note;
}

function Step({ n, title, children, id }: { n: number; title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} aria-labelledby={`step-${n}`} className="scroll-mt-20 grid gap-4 md:grid-cols-[3rem_minmax(0,1fr)]">
      <span className="grid size-10 place-items-center rounded-full bg-accent/12 font-mono text-lg text-accent" aria-hidden="true">{n}</span>
      <div className="min-w-0 space-y-4">
        <h2 id={`step-${n}`} className="text-xl font-normal tracking-[-0.01em]">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Ranking({ run, trace, teacher }: { run: RunRecord; trace?: ReasoningTrace; teacher: string }) {
  const candidates = (run.results.candidates ?? []) as CandidateSummary[];
  const byId = new Map(candidates.map((c) => [c.candidate_id, c]));
  const order = (trace?.final_order?.length ? trace.final_order : candidates.map((c) => c.candidate_id))
    .map((id) => byId.get(id)).filter((c): c is CandidateSummary => !!c);
  const shown = order.slice(0, 6);
  const selected = run.results.selected as string | undefined;
  return (
    <ol className="space-y-2" aria-label="Learner's route order">
      {shown.map((c, i) => {
        const o = OUTCOME[c.outcome] ?? { text: c.outcome.replaceAll("_", " "), tone: "neutral" as const };
        return (
          <li key={c.candidate_id} className={`soft-card flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 ${c.candidate_id === selected ? "border-good" : ""}`}>
            <span className="w-6 font-mono text-sm text-ink-3">{i + 1}.</span>
            <span className="min-w-0 flex-1 text-sm">
              {routeName(c.route_class)}{c.clearance_m > 0 && `, ${Math.round(c.clearance_m * 100)} cm clear`}
              {c.prior_note && <span className="block text-xs text-ink-3">{plainNote(c.prior_note, teacher)}</span>}
            </span>
            <Badge tone={o.tone}>{c.candidate_id === selected ? "chosen · " : ""}{o.text}</Badge>
          </li>
        );
      })}
      {order.length > shown.length && <li className="pl-10 text-xs text-ink-3">…and {order.length - shown.length} more, further down the list.</li>}
    </ol>
  );
}

function MuseSection({ trace, health, report }: { trace?: ReasoningTrace; health: Health | null; report: LibraryReport | null }) {
  const on = health?.reasoning.mode === "meta_configured";
  const usedHere = trace?.provider_used === "meta_muse_spark";
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ink-2">
        Meta Muse Spark is a language model. It never moves a robot and never decides whether something passed; the
        physics simulator does that. It has two optional jobs, and both fall back to fixed rules when it is off.
        {" "}On this server it is <b>{health ? (on ? "switched on" : "switched off") : "…"}</b>.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="soft-card space-y-2 p-5">
          <div className="flex items-center justify-between gap-2"><h3 className="font-medium">Job 1 · ranking routes</h3><EvidenceTag kind="model" /></div>
          <p className="text-sm text-ink-2">
            During a transfer, it reads the teacher&apos;s skill card, the learner&apos;s passport and which routes are
            physically possible, and suggests which to try first, with a reason. Only the top few get a full physics test.
          </p>
          <p className="text-xs text-ink-3">
            Without it, the offline planner orders routes by a fixed rule: the teacher&apos;s route first, then the most
            similar ones. {trace && (usedHere
              ? `This run used Muse (${trace.model_calls} call${trace.model_calls === 1 ? "" : "s"}${trace.estimated_cost_usd != null ? `, about $${trace.estimated_cost_usd.toFixed(4)}` : ""}).`
              : trace.fallback_error ? "This run asked for Muse, but the call failed, so the offline planner ranked it." : "This run used the offline planner; no model was called.")}
          </p>
        </div>
        <div className="soft-card space-y-2 p-5">
          <div className="flex items-center justify-between gap-2"><h3 className="font-medium">Job 2 · the librarian</h3><EvidenceTag kind="model" /></div>
          <p className="text-sm text-ink-2">
            On the Skills page, the librarian tidies the shared memory: it groups skills, spots near-duplicates, notices
            gaps (an arm that never learned a route type) and suggests which skill to teach to which arm next.
          </p>
          <p className="text-xs text-ink-3">
            The groups and suggestions always come from fixed rules; Muse only adds a written summary and reorders the
            suggestions. It cannot change or delete a skill.{" "}
            {report ? `The latest report was written by ${report.provider === "meta_muse_spark" ? `Muse (${report.model_id})` : "the offline rules"}.` : "No library report yet."}{" "}
            <Link href="/skills" className="text-accent hover:underline">Open the librarian →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Walkthrough({ run, robots }: { run: RunRecord; robots: RobotSummary[] }) {
  const skillId = String(run.results.source_skill_id ?? "");
  const detail = useApi<SkillDetail>(skillId ? `/api/skills/${encodeURIComponent(skillId)}` : null);
  const health = useApi<Health>("/api/health");
  const report = useApi<LibraryReport>("/api/library/reports/latest");
  const capsule = detail.data?.capsule;
  const teacher = robots.find((r) => r.robot_id === run.source_robot_id);
  const learner = robots.find((r) => r.robot_id === run.target_robot_id);
  const task = run.results.task as TaskSpec;
  const placement = run.results.placement as Placement;
  const trace = run.results.reasoning as ReasoningTrace | undefined;
  const metrics = run.results.search_metrics as SearchMetrics | undefined;
  const candidates = (run.results.candidates ?? []) as CandidateSummary[];
  const winner = candidates.find((c) => c.candidate_id === run.results.selected);
  const sameLayout = capsule?.task.scene_id === task.scene_id;
  const tName = teacher?.short_name ?? run.source_robot_id ?? "Teacher";
  const lName = learner?.short_name ?? run.target_robot_id ?? "Learner";

  if (detail.error) return <ErrorNote message={detail.error} />;
  if (!capsule) return <Loading label="Loading the teacher's skill…" />;
  const teacherTrace = { points: capsule.executed_trace_task_frame, label: `${tName}'s recorded hand path`, color: "var(--ink-2)", dashed: true };
  return (
    <div className="space-y-12">
      <Step n={1} title={`The ${tName} learned the task and saved a skill card`}>
        <p className="max-w-3xl text-sm text-ink-2">
          The {tName} tried up to ten routes past the wall in the simulator and kept the best one that passed:
          <b> {skillName(capsule)}</b>. The skill card stores the task (start, target, wall) and that route, measured
          from a point on the floor in front of the robot. It deliberately does <b>not</b> store the {tName}&apos;s joint
          angles: {teacher && learner && teacher.dof !== learner.dof
            ? `the ${tName} has ${teacher.dof} joints and the ${lName} has ${learner.dof}, so one arm's joint angles mean nothing to the other.`
            : `even with the same number of joints, the two arms have different link lengths, so the same angles would put the ${lName}'s hand somewhere else.`}
        </p>
        <TaskSketch task={capsule.task} traces={[teacherTrace]} />
      </Step>

      <Step n={2} title={`The same task is placed in front of the ${lName}`}>
        <p className="max-w-3xl text-sm text-ink-2">
          Because the card describes the task relative to the floor in front of a robot, it can be dropped in front of
          any arm. Each arm gets the task at a distance chosen to sit inside its working area. The dashed arc is how far
          each arm can reach, measured from its own model.
          {!sameLayout && ` This transfer also used a new layout (${task.scene_id}) the ${tName} never saw, to test that the skill generalises.`}
        </p>
        {teacher && learner && (
          <PlacementSketch task={task} seats={[
            { name: `${tName}: task ${fmtMetres(capsule.placement.translation[0])} in front`, placement: capsule.placement, reach: teacher.max_reach_m },
            { name: `${lName}: task ${fmtMetres(placement.translation[0])} in front`, placement, reach: learner.max_reach_m },
          ]} />
        )}
      </Step>

      <Step n={3} title={`The ${lName} ranks which routes to try`}>
        <p className="max-w-3xl text-sm text-ink-2">
          The {lName} works out its own joint motion for every route (inverse kinematics) and throws out any it
          physically can&apos;t do. Then it orders the rest using the {tName}&apos;s experience: the route that worked
          for the {tName} goes first. Only the first few get a full physics test.
        </p>
        <div className="flex flex-wrap gap-2">
          {trace && <Badge tone={trace.provider_used === "meta_muse_spark" ? "accent" : "neutral"}>
            ranked by {trace.provider_used === "meta_muse_spark" ? `Meta Muse Spark (${trace.model_id})` : "the offline planner"}
          </Badge>}
          {metrics && <Badge>{metrics.feasible} of {metrics.candidates_total} routes were possible for the {lName}</Badge>}
        </div>
        <Ranking run={run} trace={trace} teacher={tName} />
      </Step>

      <Step n={4} title="Physics decides whether it worked">
        <p className="max-w-3xl text-sm text-ink-2">
          The chosen motion runs in MuJoCo through the {lName}&apos;s own motors. It passes only if the hand ends within
          1 cm of the target, nothing touches the wall, no joint passes its limit and the arm comes to rest.
          {winner && (winner.route_class === capsule.strategy.route_class
            ? ` The ${lName} kept the ${tName}'s idea (${routeName(winner.route_class).toLowerCase()}) but moved its own way.`
            : ` The ${tName}'s route didn't suit the ${lName}, so it adapted: ${routeName(winner.route_class).toLowerCase()} instead.`)}
        </p>
        {winner?.physics?.trace_task && (
          <TaskSketch task={task} traces={[
            ...(sameLayout ? [teacherTrace] : []),
            { points: winner.physics.trace_task, label: `${lName}'s hand path in physics`, color: "var(--good)" },
          ]} />
        )}
        <div className="metric-grid grid grid-cols-2 sm:grid-cols-4">
          <Stat label="Result" value={run.status === "succeeded" ? "Passed" : "Failed"} />
          <Stat label="Distance from target" value={fmtM(run.endpoint_error_m, 1)} hint="limit 10 mm" />
          <Stat label="Wall touches" value={run.collision_count ?? "—"} />
          <Stat label="Physics tests used" value={metrics?.physics_rollouts ?? "—"} />
        </div>
        <p className="text-xs text-ink-3">
          All of this is simulation, not a physical robot. <Link href={`/history`} className="text-accent hover:underline">Every run is in the run log →</Link>
        </p>
      </Step>

      <Step n={5} id="muse" title="Where Meta Muse Spark fits">
        <MuseSection trace={trace} health={health.data} report={report.data} />
      </Step>
    </div>
  );
}

/** A recorded transfer, taken apart step by step. Every number and path is read from the stored run and skill. */
export function UnderTheHood() {
  const runs = useApi<RunRecord[]>("/api/runs?run_type=transfer&limit=100");
  const robots = useApi<RobotSummary[]>("/api/robots");
  const [picked, setPicked] = useState<string | null>(null);
  const done = runs.data?.filter((r) => r.status === "succeeded" && r.results.task) ?? [];
  const run = done.find((r) => r.run_id === picked) ?? done[0];
  const name = (id: string | null) => robots.data?.find((r) => r.robot_id === id)?.short_name ?? id ?? "?";

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="How a skill moves between arms" title="Under the hood" actions={done.length > 1 && (
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Recorded transfer
          <select value={run?.run_id} onChange={(e) => setPicked(e.target.value)} aria-label="Recorded transfer"
            className="border border-line-strong bg-panel px-3 py-2 text-sm text-ink">
            {done.map((r) => (
              <option key={r.run_id} value={r.run_id}>{name(r.source_robot_id)} → {name(r.target_robot_id)} · layout {r.task_seed} · {r.run_id.slice(-6)}</option>
            ))}
          </select>
        </label>
      )}>
        One real, recorded transfer, taken apart one step at a time: what the teacher saved, how it is placed in front
        of a different arm, how that arm picks a route, and where the Muse model does and doesn&apos;t come in.
      </PageHeader>
      {(runs.error || robots.error) && <ErrorNote message={(runs.error || robots.error)!} />}
      {runs.data && done.length === 0 && (
        <p className="soft-card p-8 text-sm text-ink-3">
          No successful transfer has been recorded yet. <Link href="/transfer" className="text-accent hover:underline">Run one in Transfer Lab →</Link>
        </p>
      )}
      {run && robots.data ? <Walkthrough key={run.run_id} run={run} robots={robots.data} /> : !runs.error && done.length > 0 && <Loading />}
    </div>
  );
}
