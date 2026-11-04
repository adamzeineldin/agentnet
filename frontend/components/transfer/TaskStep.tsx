"use client";

import { useState } from "react";
import { designTask, scoutPlan } from "@/lib/api";
import { DESIGNED_PREFIX, TASK_TITLES, type TaskTypeInfo } from "@/lib/tasks";
import type { DesignResult, RobotSummary, ScoutPick, ScoutPlan } from "@/lib/types";
import { ActButton } from "../auth/SignIn";
import { Badge, ErrorNote } from "../ui";
import { DesignedTask, DesignerBadge } from "./DesignedTask";
import { TaskSketch } from "./TaskSketch";

interface TaskStepProps {
  family: string;
  /** Every task type, built in and designed (GET /api/tasks); null while loading. */
  tasks: TaskTypeInfo[] | null;
  learner: RobotSummary;
  robots: RobotSummary[];
  disabled: boolean;
  onFamily: (family: string) => void;
  /** Learn from a saved skill Muse picked: its robot becomes the teacher. */
  onUsePick: (family: string, pick: ScoutPick) => void;
  /** No saved skill fits: this robot learns the task first. */
  onUseTeacher: (family: string, teacherId: string) => void;
  /** A task type was just designed: reload the task types and select it. */
  onDesigned: (family: string) => void;
}

const EXAMPLES = ["Put a cup on a high shelf", "Reach into a deep bin", "Reach under a low beam", "Reach past two staggered walls"];
const DESIGNED_SHOWN = 6;

type Asking = "scout" | "design" | null;

function MuseScout({ learner, robots, disabled, onUsePick, onUseTeacher, onDesigned }:
  Omit<TaskStepProps, "family" | "onFamily" | "tasks">) {
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<ScoutPlan | null>(null);
  const [designed, setDesigned] = useState<DesignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const name = (id: string | null) => robots.find((r) => r.robot_id === id)?.short_name ?? id ?? "";
  const ready = goal.trim().length >= 3 && !asking && !disabled;

  async function ask(text: string, kind: "scout" | "design") {
    setGoal(text);
    setAsking(kind);
    setError(null);
    try {
      if (kind === "scout") {
        setPlan(await scoutPlan(text, learner.robot_id));
        setDesigned(null);
      } else {
        setDesigned(await designTask(text));
        setPlan(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(null);
    }
  }

  const muse = plan?.provider === "meta_muse_spark";
  return (
    <div className="space-y-3 rounded-2xl bg-panel-2/60 p-4">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (ready) void ask(goal.trim(), "scout"); }}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">What should the {learner.short_name} do?</span>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={300} disabled={!!asking || disabled}
            placeholder={`Describe it: what should the ${learner.short_name} do?`}
            className="w-full border border-line-strong bg-panel px-3 py-2 text-sm text-ink" />
        </label>
        <ActButton type="submit" disabled={!ready} className="button-primary disabled:opacity-50">
          {asking === "scout" ? "Muse is reading the library…" : "Find what to learn from"}
        </ActButton>
        <ActButton type="button" disabled={!ready} onClick={() => void ask(goal.trim(), "design")} className="pill disabled:opacity-50">
          {asking === "design" ? "Muse is designing…" : "Design a new task"}
        </ActButton>
      </form>
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
        <span className="mr-1">Try</span>{EXAMPLES.map((ex) => <button key={ex} type="button" disabled={!!asking || disabled} onClick={() => setGoal(ex)}
          className="rounded-full bg-panel px-2.5 py-1 text-ink-2 transition-colors hover:text-accent">{ex}</button>)}
      </p>
      {asking === "design" && <p className="text-xs text-ink-3" aria-live="polite">
        Designing and checking a layout (up to a minute with Muse)…</p>}
      {error && <ErrorNote message={error} />}
      {designed && <DesignedTask result={designed} disabled={disabled} onTeach={onDesigned} />}
      {plan && (
        <div className="space-y-3 border-t border-line pt-3 text-sm" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={muse ? "accent" : "neutral"}>{muse ? `Meta Muse Spark · ${plan.model_id}` : "Offline scout · no model call"}</Badge>
            {plan.usage && plan.usage.model_calls > 0 && <span className="text-xs text-ink-3">
              {plan.usage.model_calls} model call · {(plan.usage.prompt_tokens ?? 0) + (plan.usage.completion_tokens ?? 0)} tokens
              {plan.usage.estimated_cost_usd != null && ` · about $${plan.usage.estimated_cost_usd.toFixed(4)}`}</span>}
          </div>
          <p>Task type: <b>{plan.task_title}</b>{plan.task_why && <span className="text-ink-2">. {plan.task_why}</span>}</p>
          {plan.summary && <p className="text-ink-2">{plan.summary}</p>}
          {plan.picks.length > 0 ? (
            <ol className="space-y-2">
              {plan.picks.map((p, i) => (
                <li key={p.skill_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <b>{i + 1}. Learn from the {name(p.source_robot_id)}</b> <span className="text-ink-3">({p.route})</span>
                    {p.why && <span className="block text-xs text-ink-2">{p.why}</span>}
                  </span>
                  <button type="button" disabled={disabled} onClick={() => onUsePick(plan.task_family, p)} className="pill">Use this</button>
                </li>
              ))}
            </ol>
          ) : plan.teacher_robot_id && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2">
              <span className="min-w-0 flex-1">No robot has saved this task yet. <b>Teach the {name(plan.teacher_robot_id)} first</b>
                {plan.teacher_why && <span className="block text-xs text-ink-2">{plan.teacher_why}</span>}</span>
              <button type="button" disabled={disabled} onClick={() => onUseTeacher(plan.task_family, plan.teacher_robot_id!)} className="pill">Use this</button>
            </div>
          )}
          <p className="text-xs text-ink-3">
            {muse ? "Muse only suggests. " : ""}Whether the {learner.short_name} can really learn it is decided below, in the physics simulator.
            {plan.fallback_error && ` Muse could not answer (${plan.fallback_error}), so the offline scout did.`}
          </p>
          <p className="text-xs text-ink-3">Not quite the task you meant?{" "}
            <button type="button" disabled={!ready} onClick={() => void ask(goal.trim(), "design")} className="text-accent hover:underline">
              Let Muse design a new task from this description</button>.</p>
        </div>
      )}
    </div>
  );
}

function TaskChoice({ task, checked, disabled, onPick }: {
  task: TaskTypeInfo; checked: boolean; disabled: boolean; onPick: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={checked} disabled={disabled} onClick={onPick} title={task.summary || undefined}
      className={`rounded-xl border p-3 text-left transition-colors ${checked ? "border-accent bg-panel" : "border-line bg-panel-2/40 hover:border-line-strong"}`}>
      {task.example && <TaskSketch task={task.example} />}
      <span className="block text-sm font-medium">{task.title}</span>

      {task.design && <span className="mt-1 block"><DesignerBadge provider={task.design.provider} /></span>}
    </button>
  );
}

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] gap-2";

/** Step 1: what the robots learn. Pick a task type, describe it so Muse finds skills, or let Muse design a new one. */
export function TaskStep(props: TaskStepProps) {
  const { family, tasks, disabled, onFamily } = props;
  const [showAll, setShowAll] = useState(false);
  const list = tasks ?? Object.entries(TASK_TITLES).map(([f, title]) => ({ family: f, title, summary: "", example: null }));
  const builtIn = list.filter((t) => !t.family.startsWith(DESIGNED_PREFIX));
  const designed = list.filter((t) => t.family.startsWith(DESIGNED_PREFIX)).reverse(); // newest first
  // Keep the selected designed task visible even when it is not among the newest.
  const shown = showAll ? designed : designed.filter((t, i) => i < DESIGNED_SHOWN || t.family === family);
  const choice = (t: TaskTypeInfo) => (
    <TaskChoice key={t.family} task={t} checked={family === t.family} disabled={disabled} onPick={() => onFamily(t.family)} />
  );
  return (
    <div className="space-y-4">
      <MuseScout {...props} />
      <div role="radiogroup" aria-label="Task type" className="space-y-3">
        <p className="text-xs text-ink-3">Or pick one</p>
        <div className={GRID}>{builtIn.map(choice)}</div>
        {designed.length > 0 && (
          <>
            <p className="text-xs text-ink-3">Designed by description · {designed.length}</p>
            <div className={GRID}>{shown.map(choice)}</div>
            {designed.length > shown.length && (
              <button type="button" onClick={() => setShowAll(true)} className="text-xs text-accent hover:underline">
                Show all {designed.length} designed tasks</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
