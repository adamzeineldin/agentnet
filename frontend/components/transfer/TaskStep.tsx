"use client";

import { useState } from "react";
import { scoutPlan } from "@/lib/api";
import { TASK_TITLES, type TaskTypeInfo } from "@/lib/tasks";
import type { RobotSummary, ScoutPick, ScoutPlan, TaskSpec } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { ActButton } from "../auth/SignIn";
import { Badge, ErrorNote } from "../ui";

interface TaskStepProps {
  family: string;
  learner: RobotSummary;
  robots: RobotSummary[];
  disabled: boolean;
  onFamily: (family: string) => void;
  /** Learn from a saved skill Muse picked: its robot becomes the teacher. */
  onUsePick: (family: string, pick: ScoutPick) => void;
  /** No saved skill fits: this robot learns the task first. */
  onUseTeacher: (family: string, teacherId: string) => void;
}

const EXAMPLES = ["Put a cup on a high shelf", "Reach through a gap between two posts", "Reach under a table"];

/** Top view of a layout: obstacles as boxes, start ● and target ○ (task frame, robot at the bottom). */
function TaskSketch({ task }: { task: TaskSpec }) {
  const s = 220; // px per metre
  const x = (v: number) => 60 + v * s; // lateral (task y) to the right
  const y = (v: number) => 46 - v * s; // away from the robot (task x) upwards
  return (
    <svg viewBox="0 0 120 92" className="h-16 w-full" aria-hidden="true">
      {task.obstacles.map((o) => (
        <rect key={o.name} x={x(o.center[1] - o.half_size[1])} y={y(o.center[0] + o.half_size[0])}
          width={2 * o.half_size[1] * s} height={2 * o.half_size[0] * s} rx={1}
          className="fill-ink-3/40 stroke-ink-3" strokeWidth={0.6} />
      ))}
      <circle cx={x(task.start[1])} cy={y(task.start[0])} r={3} className="fill-ink" />
      <circle cx={x(task.target[1])} cy={y(task.target[0])} r={3} className="fill-none stroke-accent" strokeWidth={1.5} />
    </svg>
  );
}

function MuseScout({ learner, robots, disabled, onUsePick, onUseTeacher }: Omit<TaskStepProps, "family" | "onFamily">) {
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<ScoutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const name = (id: string | null) => robots.find((r) => r.robot_id === id)?.short_name ?? id ?? "";

  async function ask(text: string) {
    setGoal(text);
    setAsking(true);
    setError(null);
    try {
      setPlan(await scoutPlan(text, learner.robot_id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  }

  const muse = plan?.provider === "meta_muse_spark";
  return (
    <div className="space-y-3 rounded-2xl bg-panel-2/60 p-4">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (goal.trim().length >= 3) void ask(goal.trim()); }}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">What should the {learner.short_name} do?</span>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={300} disabled={asking || disabled}
            placeholder={`Describe it: what should the ${learner.short_name} do?`}
            className="w-full border border-line-strong bg-panel px-3 py-2 text-sm text-ink" />
        </label>
        <ActButton type="submit" disabled={asking || disabled || goal.trim().length < 3} className="button-primary disabled:opacity-50">
          {asking ? "Muse is reading the library…" : "Ask Muse"}
        </ActButton>
      </form>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
        Try:{EXAMPLES.map((ex) => <button key={ex} type="button" disabled={asking || disabled} onClick={() => void ask(ex)}
          className="text-accent hover:underline">“{ex}”</button>)}
      </p>
      {error && <ErrorNote message={error} />}
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
        </div>
      )}
    </div>
  );
}

/** Step 1: what the robots learn. Pick a task type, or describe it and let Muse choose it and what to learn from. */
export function TaskStep(props: TaskStepProps) {
  const { family, disabled, onFamily } = props;
  const tasks = useApi<TaskTypeInfo[]>("/api/tasks");
  const list = tasks.data ?? Object.entries(TASK_TITLES).map(([f, title]) => ({ family: f, title, summary: "", example: null }));
  return (
    <div className="space-y-4">
      <MuseScout {...props} />
      <div>
        <p className="mb-2 text-xs text-ink-3">Or pick a task type yourself:</p>
        <div role="radiogroup" aria-label="Task type" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] gap-2">
          {list.map((t) => (
            <button key={t.family} type="button" role="radio" aria-checked={family === t.family} disabled={disabled}
              onClick={() => onFamily(t.family)}
              className={`rounded-xl border p-3 text-left transition-colors ${family === t.family ? "border-accent bg-panel" : "border-line bg-panel-2/40 hover:border-line-strong"}`}>
              {t.example && <TaskSketch task={t.example} />}
              <span className="block text-sm font-medium">{t.title}</span>
              {t.summary && <span className="mt-0.5 block text-xs text-ink-3">{t.summary}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
