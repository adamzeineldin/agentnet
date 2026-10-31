"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import type {
  ControllerExecution, ControllerStatusInfo, ExecuteOn, Health, ReasoningMode, RobotSummary,
} from "@/lib/types";
import type { RunStream } from "@/lib/useRunStream";
import { ActButton } from "../auth/SignIn";
import { EventLog } from "../RunEvidence";
import { Term } from "../Term";
import { Disclosure } from "../ui";
import { ControllerPanel } from "./ControllerPanel";
import { describeTransfer } from "./describe";
import { ImaginationPanel } from "./ImaginationPanel";
import { JointCorrespondence } from "./JointCorrespondence";
import { RunProgress } from "./RunProgress";
import { RunStory } from "./RunStory";
import { RunVideo } from "./RunMedia";

interface LearnerStepProps {
  teacher: RobotSummary;
  learner: RobotSummary;
  robots: RobotSummary[];
  stream: RunStream;
  teacherLayout: number;
  onLearn: (sceneSeed: number | null, mode: ReasoningMode, executeOn: ExecuteOn) => void;
  onSave: () => void;
}

/** Step 3: the learner adapts the teacher's skill, then "What just happened" tells the story of that very run. */
export function LearnerStep({ teacher, learner, robots, stream, teacherLayout, onLearn, onSave }: LearnerStepProps) {
  const { run, busy } = stream;
  const [newLayout, setNewLayout] = useState(false);
  const [layout, setLayout] = useState(3);
  const [mode, setMode] = useState<ReasoningMode>("offline");
  const [onUrsim, setOnUrsim] = useState(false);
  const health = useApi<Health>("/api/health");
  const ursim = useApi<ControllerStatusInfo>("/api/controller/status");
  const hasUrsim = learner.controller === "ursim";
  const ursimReady = hasUrsim && ursim.data?.ready === true;
  const metaAvailable = health.data?.reasoning.mode === "meta_configured";
  const saved = run?.results.published === true;
  const controller = run?.results.controller_execution as ControllerExecution | undefined;
  const t = teacher.short_name;
  const l = learner.short_name;

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ink-2">
        The {l} reads the {t}&apos;s skill, works out its own joint motion and has to pass the same physics test.
        It never sees the {t}&apos;s joint angles.
      </p>
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <legend className="sr-only">Which layout the learner is tested on</legend>
        <label className="flex items-center gap-2">
          <input type="radio" checked={!newLayout} onChange={() => setNewLayout(false)} disabled={busy} />
          the same layout ({teacherLayout})
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={newLayout} onChange={() => setNewLayout(true)} disabled={busy} />
          a layout it hasn&apos;t seen:
          <input type="number" min={0} value={layout} disabled={busy || !newLayout} aria-label="New layout number"
            onChange={(e) => setLayout(Math.max(0, Number.parseInt(e.target.value || "0", 10)))}
            className="tabular w-20 border border-line-strong bg-panel px-2 py-1 text-ink disabled:opacity-50" />
        </label>
      </fieldset>
      <Disclosure summary="More options" hint={`route order: ${mode === "meta" ? "Muse Spark" : "fixed rule"}`}>
        <div className="space-y-3 text-sm">
          <label className="flex flex-wrap items-center gap-2">
            <Term id="routeRanking">Who picks the route order</Term>
            <select value={mode} disabled={busy} onChange={(e) => setMode(e.target.value as ReasoningMode)}
              className="min-w-0 max-w-full border border-line-strong bg-panel px-2 py-1 text-ink">
              <option value="offline">A fixed rule (no AI)</option>
              <option value="meta" disabled={!metaAvailable}>Meta Muse Spark{metaAvailable ? "" : " (not switched on here)"}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-ink-2" title={ursim.data?.detail}>
            <input type="checkbox" aria-label="Also run on the URSim controller (not physical)"
              checked={onUrsim && ursimReady} disabled={busy || !ursimReady} onChange={(e) => setOnUrsim(e.target.checked)} />
            also run it on Universal Robots&apos; <Term id="ursim">URSim</Term> controller (not physical)
            {!ursimReady && <span className="text-ink-3">· {!hasUrsim ? `UR5e only` : ursim.data?.configured ? "not ready" : "not configured"}</span>}
          </label>
        </div>
      </Disclosure>
      <ActButton onClick={() => onLearn(newLayout ? layout : null, mode, onUrsim && ursimReady ? "ursim" : "none")}
        disabled={busy} className="button-primary disabled:cursor-wait disabled:opacity-50">
        {busy ? "Learning…" : `Let the ${l} learn it`}
      </ActButton>
      {busy && <RunProgress events={stream.events} />}
      {run && !busy && (
        <div className="space-y-5">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <RunVideo run={run} busy={false} emptyLabel="" />
            <div className="space-y-3">
              <p className={`text-base ${run.status === "succeeded" ? "text-ink" : "text-bad"}`}>{describeTransfer(run, t, l)}</p>
              {run.status === "succeeded" && (saved
                ? <p className="text-sm text-good">✓ Saved. It shows on the <Link href="/skills" className="underline">Skills</Link> page as learned from the {t}.</p>
                : <ActButton onClick={onSave} className="button-primary">Save the {l}&apos;s version</ActButton>)}
              {controller && <ControllerPanel execution={controller} />}
            </div>
          </div>
          <Disclosure summary="What just happened" hint="the four steps of this run, in plain words" open>
            <RunStory run={run} robots={robots} />
          </Disclosure>
          <Disclosure summary="Technical detail" hint="predicted futures, joint limits and the full log">
            <div className="space-y-6">
              <ImaginationPanel run={run} />
              <JointCorrespondence sourceId={teacher.robot_id} targetId={learner.robot_id} />
              <EventLog events={run.events} />
            </div>
          </Disclosure>
        </div>
      )}
    </div>
  );
}
