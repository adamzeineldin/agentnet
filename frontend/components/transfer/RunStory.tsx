"use client";

import type { ReactNode } from "react";
import { fmtM, fmtMetres } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type {
  CandidateSummary, Placement, ReasoningTrace, RobotSummary, RunRecord, SearchMetrics, SkillDetail, TaskSpec,
} from "@/lib/types";
import { PlacementSketch, TaskSketch } from "../hood/Sketches";
import { outcomeText, plainNote } from "../run/outcomes";
import { Badge, ErrorNote, Loading, Stat } from "../ui";
import { routeName, skillName } from "./skillName";


function Part({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="flex items-baseline gap-2 text-base font-medium"><span className="font-mono text-sm text-accent">{n}</span>{title}</h3>
      {children}
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
        const o = outcomeText(c.outcome);
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

/** A finished transfer told as four plain steps. Every number and path is read from the stored run and its source skill. */
export function RunStory({ run, robots }: { run: RunRecord; robots: RobotSummary[] }) {
  const skillId = String(run.results.source_skill_id ?? "");
  const detail = useApi<SkillDetail>(skillId ? `/api/skills/${encodeURIComponent(skillId)}` : null);
  const capsule = detail.data?.capsule;
  const teacher = robots.find((r) => r.robot_id === run.source_robot_id);
  const learner = robots.find((r) => r.robot_id === run.target_robot_id);
  const task = run.results.task as TaskSpec | undefined;
  const placement = run.results.placement as Placement | undefined;
  const trace = run.results.reasoning as ReasoningTrace | undefined;
  const metrics = run.results.search_metrics as SearchMetrics | undefined;
  const candidates = (run.results.candidates ?? []) as CandidateSummary[];
  const winner = candidates.find((c) => c.candidate_id === run.results.selected);
  const tName = teacher?.short_name ?? run.source_robot_id ?? "teacher";
  const lName = learner?.short_name ?? run.target_robot_id ?? "learner";

  if (detail.error) return <ErrorNote message={detail.error} />;
  if (!capsule || !task || !placement) return <Loading label="Loading the story of this run…" />;
  const sameLayout = capsule.task.scene_id === task.scene_id;
  const teacherTrace = { points: capsule.executed_trace_task_frame, label: `${tName}'s hand path`, color: "var(--ink-2)", dashed: true };
  return (
    <div className="space-y-6">
      <Part n={1} title={`What the ${lName} was given`}>
        <p className="max-w-3xl text-sm text-ink-2">
          The {tName}&apos;s saved skill: <b>{skillName(capsule)}</b>. It holds where the start, target and wall are, and
          the route that worked, measured from a spot on the floor in front of the robot. It does <b>not</b> hold the
          {" "}{tName}&apos;s joint angles: {teacher && learner && teacher.dof !== learner.dof
            ? `the ${tName} has ${teacher.dof} joints and the ${lName} has ${learner.dof}, so joint angles can't be copied.`
            : "the two arms have different link lengths, so the same angles would put the hand somewhere else."}
        </p>
        <TaskSketch task={capsule.task} traces={[teacherTrace]} />
      </Part>

      <Part n={2} title={`The task is placed in front of the ${lName}`}>
        <p className="max-w-3xl text-sm text-ink-2">
          Because the skill describes the task from the floor in front of a robot, it can be set down in front of any
          arm. The dashed arc is how far each arm can reach.
          {!sameLayout && ` This time the ${lName} was also tested on a new layout (${task.seed}) the ${tName} never saw.`}
        </p>
        {teacher && learner && (
          <PlacementSketch task={task} seats={[
            { name: `${tName}: task ${fmtMetres(capsule.placement.translation[0])} in front`, placement: capsule.placement, reach: teacher.max_reach_m },
            { name: `${lName}: task ${fmtMetres(placement.translation[0])} in front`, placement, reach: learner.max_reach_m },
          ]} />
        )}
      </Part>

      <Part n={3} title="Which route to try first">
        <p className="max-w-3xl text-sm text-ink-2">
          The {lName} works out its own joint motion for every route and drops the ones its body can&apos;t do. It tries
          the rest in order of what worked for the {tName}. Only the first few get a full physics test.
        </p>
        <div className="flex flex-wrap gap-2">
          {trace && <Badge tone={trace.provider_used === "meta_muse_spark" ? "accent" : "neutral"}>
            order chosen by {trace.provider_used === "meta_muse_spark" ? `Meta Muse Spark (${trace.model_id})` : "a fixed rule, no AI"}
          </Badge>}
          {metrics && <Badge>{metrics.feasible} of {metrics.candidates_total} routes were possible for the {lName}</Badge>}
        </div>
        <Ranking run={run} trace={trace} teacher={tName} />
      </Part>

      <Part n={4} title="The physics test">
        <p className="max-w-3xl text-sm text-ink-2">
          The chosen motion runs in the simulator through the {lName}&apos;s own motors. It passes only if the hand ends
          within 1 cm of the target, nothing touches the wall, no joint goes past its limit and the arm comes to rest.
          {winner && (winner.route_class === capsule.strategy.route_class
            ? ` The ${lName} kept the ${tName}'s idea (${routeName(winner.route_class).toLowerCase()}) but moved its own way.`
            : ` It went ${routeName(winner.route_class).toLowerCase()} instead of the ${tName}'s route.`)}
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
      </Part>
    </div>
  );
}
