"use client";

import Link from "next/link";
import type { ControllerExecution, ImprovementVerdict, RobotSummary, RunRecord } from "@/lib/types";
import type { RunStream } from "@/lib/useRunStream";
import { EventLog } from "../RunEvidence";
import { ControllerPanel } from "../transfer/ControllerPanel";
import { describeDiscover, describeTransfer } from "../transfer/describe";
import { ImaginationPanel } from "../transfer/ImaginationPanel";
import { JointCorrespondence } from "../transfer/JointCorrespondence";
import { VisibilityControl } from "../library/Visibility";
import { LabRun } from "./LabRun";
import { Comparison } from "./Metrics";

export type Activity = "replay" | "improve" | "adapt" | "learn";

interface RunPanelProps {
  activity: Activity;
  stream: RunStream;
  robot: RobotSummary;
  robots: RobotSummary[];
}

function Verdict({ v }: { v: ImprovementVerdict }) {
  return (
    <div className="space-y-3">
      <p className={`text-base ${v.better ? "text-good" : "text-ink"}`}>
        {v.better ? "✓ The new motion is better, so it replaced the old one in the Library."
          : "The existing skill is kept: the new attempt was not validated as better."}
      </p>
      <ul className="space-y-0.5 text-sm text-ink-2">{v.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      {v.candidate && <Comparison existing={v.existing} candidate={v.candidate} />}
      <p className="text-xs text-ink-3">{v.basis}</p>
    </div>
  );
}

function Outcome({ activity, run, me, teacher }: { activity: Activity; run: RunRecord; me: string; teacher: string }) {
  const verdict = run.results.improvement as ImprovementVerdict | undefined;
  if (activity === "improve" && verdict) return <Verdict v={verdict} />;
  const text = run.run_type === "discover" ? describeDiscover(run, me) : describeTransfer(run, teacher, me);
  const saved = run.results.published === true;
  const savedSkill = (run.results.capsule_draft as { skill_id?: string } | undefined)?.skill_id;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className={`min-w-0 flex-1 text-base ${run.status === "succeeded" ? "text-ink" : "text-bad"}`}>{text}</p>
      {activity === "replay" && <p className="text-xs text-ink-3">Recorded run, replayed. Nothing was retrained.</p>}
      {activity !== "replay" && saved && run.visibility === "public" && (
        <p className="text-sm text-good">✓ Saved to the <Link href="/library" className="underline">Library</Link>.</p>
      )}
      {activity !== "replay" && saved && run.visibility === "private" && (
        <div className="w-full space-y-2">
          <p className="text-sm text-good">
            ✓ Saved to <Link href="/library?who=mine" className="underline">your Library</Link>. Only you see it until you make it public.
          </p>
          {savedSkill && <VisibilityControl kind="skill" id={savedSkill} visibility="private" />}
        </div>
      )}
      {activity !== "replay" && run.status !== "succeeded" && <p className="text-xs text-ink-3">Nothing was saved.</p>}
    </div>
  );
}

const HEADING: Record<Activity, (me: string, teacher: string) => string> = {
  replay: (me) => `The ${me}'s verified run`,
  improve: (me, t) => `Trying the ${t}'s experience on the ${me}`,
  adapt: (me, t) => `Adapting the ${t}'s skill to the ${me}`,
  learn: (me) => `The ${me} learns it directly`,
};

/** The run behind the current step, live or recorded, with what came of it in plain words. */
export function RunPanel({ activity, stream, robot, robots }: RunPanelProps) {
  const { run, busy } = stream;
  const kind = run?.run_type === "discover" || (!run && activity === "learn") ? "discover" : "transfer";
  const teacherId = run?.source_robot_id ?? null;
  const teacher = robots.find((r) => r.robot_id === teacherId);
  const t = teacher?.short_name ?? "other robot";
  const me = robot.short_name;
  const controller = run?.results.controller_execution as ControllerExecution | undefined;
  if (!busy && !run) return null;

  return (
    <section aria-label="The run" className="space-y-4">
      <h2 className="text-lg font-normal tracking-[-0.01em]">{HEADING[activity](me, t)}</h2>
      {run && !busy && <div className="soft-card px-4 py-3"><Outcome activity={activity} run={run} me={me} teacher={t} /></div>}
      <LabRun key={stream.runId ?? "none"} kind={kind} runId={stream.runId} events={stream.events} run={run} busy={busy}
        names={kind === "discover" ? { robot: me, robotDof: robot.dof }
          : { robot: me, teacher: t, robotDof: robot.dof, teacherDof: teacher?.dof ?? 0 }}
        details={run && !busy && (
          <>
            {kind === "transfer" && <ImaginationPanel run={run} />}
            {kind === "transfer" && teacherId && <JointCorrespondence sourceId={teacherId} targetId={robot.robot_id} />}
            <EventLog events={run.events} />
          </>
        )} />
      {controller && !busy && <ControllerPanel execution={controller} />}
    </section>
  );
}
