"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { checkLearning, startDiscover, startImprove, startTransfer } from "@/lib/api";
import { randomLayout, type TaskTypeInfo } from "@/lib/tasks";
import type { LearningCheck, RobotSummary, SkillMetrics } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useRunStream } from "@/lib/useRunStream";
import { SignInGate } from "../auth/SignInGate";
import { ErrorNote, Loading } from "../ui";
import { Decision, type DecisionActions } from "./Decision";
import { useLabQuery } from "./labQuery";
import { RobotMenu } from "./RobotMenu";
import { RunPanel, type Activity } from "./RunPanel";
import { TaskPicker } from "./TaskPicker";

const DEFAULT_ROBOT = "ur5e_01";
const GATE_POINTS = ["See what a robot already knows", "Adapt another robot's skill, or learn a new one", "Save verified skills to the shared Library"];

/** The Lab: open to signed-in visitors (or to everyone when sign-in is off on this server). */
export function Lab() {
  return (
    <SignInGate title="The Lab is where robots learn" points={GATE_POINTS}>
      <LabBody />
    </SignInGate>
  );
}

function LabBody() {
  const robots = useApi<RobotSummary[]>("/api/robots");
  const tasks = useApi<TaskTypeInfo[]>("/api/tasks");
  if (robots.error) return <ErrorNote message={robots.error} />;
  if (!robots.data) return <Loading label="Loading the robots…" />;
  if (robots.data.length === 0) return <ErrorNote message="The fleet is empty; add a robot in the Library first." />;
  return <Workbench robots={robots.data} tasks={tasks.data} tasksError={tasks.error} reloadTasks={tasks.reload} />;
}

/** The librarian's answer for one robot and task type; reloaded after any run that may have saved a skill. */
function useCheck(robot: string, family: string | null, from: string | null) {
  const [check, setCheck] = useState<LearningCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!family) return;
    let cancelled = false;
    checkLearning(robot, family, from)
      .then((c) => { if (!cancelled) { setCheck(c); setError(null); } })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [robot, family, from, tick]);
  const current = check && check.robot_id === robot && check.task_family === family ? check : null;
  return { check: family ? current : null, error, reload: useCallback(() => setTick((t) => t + 1), []) };
}

function Workbench({ robots, tasks, tasksError, reloadTasks }: {
  robots: RobotSummary[]; tasks: TaskTypeInfo[] | null; tasksError: string | null; reloadTasks: () => void;
}) {
  const { query, update } = useLabQuery();
  const ids = robots.map((r) => r.robot_id);
  const robotId = query.robot && ids.includes(query.robot) ? query.robot : ids.includes(DEFAULT_ROBOT) ? DEFAULT_ROBOT : ids[0];
  const robot = robots.find((r) => r.robot_id === robotId)!;
  // Any task type is trusted while the list loads (the check endpoint rejects unknown ones); then only listed types.
  const family = query.task && (!tasks || tasks.some((t) => t.family === query.task)) ? query.task : null;
  const from = query.from && query.from !== robotId ? query.from : null;
  const { check, error: checkError, reload: reloadCheck } = useCheck(robotId, family, from);
  const stream = useRunStream();
  // The run on screen belongs to one robot and task; choosing another (or going Back) hides it.
  const scope = `${robotId}|${family}`;
  // `teacher` is the skill an adapt run started from, kept so the result can be compared with it.
  const [shown, setShown] = useState<{ scope: string; activity: Activity; teacher?: SkillMetrics } | null>(null);
  const activity = shown?.scope === scope ? shown.activity : null;
  const setActivity = (a: Activity, teacher?: SkillMetrics) => setShown({ scope, activity: a, teacher });
  const finished = stream.run && !stream.busy ? stream.run.run_id : null;
  const choose = (patch: Parameters<typeof update>[0]) => {
    stream.clear();
    setShown(null);
    update(patch);
  };

  // A finished run may have saved a skill: ask the librarian again (e.g. "learn" becomes "known").
  useEffect(() => {
    if (finished) reloadCheck();
  }, [finished, reloadCheck]);

  const run = (a: Activity, starter: Parameters<typeof stream.start>[0], teacher?: SkillMetrics) => {
    setActivity(a, teacher);
    void stream.start(starter);
  };
  const actions: DecisionActions = {
    onReplay: () => {
      if (!check?.existing?.run_id) return;
      setActivity("replay");
      void stream.load(check.existing.run_id);
    },
    onImprove: (source) => check?.existing && run("improve", () => startImprove(check.existing!.skill_id, source.skill_id)),
    onAdapt: (source, c) => run("adapt", () => startTransfer(source.skill_id, robotId, null, c.mode, c.executeOn, true), source),
    onLearn: (layout) => family && run("learn", () => startDiscover(robotId, layout ?? randomLayout(), family, true)),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-normal tracking-[-0.02em]">Lab</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-3">
            Pick a robot and describe a task. The library is checked first, so a robot never relearns what it already knows.
          </p>
        </div>
        <Link href="/library" className="button-secondary">Open the Library</Link>
      </div>
      {tasksError && <ErrorNote message={tasksError} />}
      {tasks && (
        <TaskPicker robotId={robotId} robotName={robot.short_name} disabled={stream.busy}
          robotMenu={<RobotMenu label="Robot" value={robotId} disabled={stream.busy} onPick={(id) => choose({ robot: id, from: null })}
            options={robots.map((r) => ({ id: r.robot_id, robot: r, label: r.short_name, detail: `${r.dof} joints` }))}
            footer={<Link href="/library?view=robots" className="text-accent hover:underline">+ Add a robot</Link>} />}
          onPick={(f) => choose({ task: f, from: null })}
          onDesigned={(f) => { reloadTasks(); choose({ task: f, from: null }); }} />
      )}
      {[checkError, stream.error].filter(Boolean).map((e) => <ErrorNote key={e} message={e!} />)}
      {!family && (
        <p className="rounded-[var(--radius)] border border-dashed border-line-strong p-8 text-center text-sm text-ink-3">
          Describe a task to see what the library already holds for the {robot.short_name}.
        </p>
      )}
      {family && !check && !checkError && <Loading label="Checking the library…" />}
      {check && <Decision key={scope} check={check} robot={robot} robots={robots} busy={stream.busy}
        onClearTask={() => choose({ task: null, from: null })} {...actions} />}
      {activity && <RunPanel activity={activity} stream={stream} robot={robot} robots={robots} teacher={shown?.teacher}
        saved={check?.existing && check.existing.run_id === stream.run?.run_id ? check.existing : null} />}
    </div>
  );
}
