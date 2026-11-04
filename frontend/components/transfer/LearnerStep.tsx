"use client";

import Link from "next/link";
import { useState } from "react";
import { randomLayout } from "@/lib/tasks";
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
import { ExactLayout } from "./ExactLayout";
import { ImaginationPanel } from "./ImaginationPanel";
import { JointCorrespondence } from "./JointCorrespondence";
import { RunViewer } from "../run/RunViewer";
import { RunStory } from "./RunStory";

/** Selected look for a radio inside a `.segmented` control (that class styles tabs by aria-selected). */
const SEG_ON = "aria-checked:bg-ink! aria-checked:text-bg!";

interface LearnerStepProps {
  teacher: RobotSummary;
  learner: RobotSummary;
  robots: RobotSummary[];
  stream: RunStream;
  onLearn: (sceneSeed: number | null, mode: ReasoningMode, executeOn: ExecuteOn) => void;
  onSave: () => void;
}

/** Step 3: the learner adapts the teacher's skill, then "What just happened" tells the story of that very run. */
export function LearnerStep({ teacher, learner, robots, stream, onLearn, onSave }: LearnerStepProps) {
  const { run, busy } = stream;
  const [newLayout, setNewLayout] = useState(false);
  const [exact, setExact] = useState<number | null>(null);
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
      <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="How the learner learns">
        <li className="rounded-full bg-good/10 px-2.5 py-1 text-good">✓ reads the {t}&apos;s skill</li>
        <li className="rounded-full bg-good/10 px-2.5 py-1 text-good">✓ its own joint motion</li>
        <li className="rounded-full bg-good/10 px-2.5 py-1 text-good">✓ same physics test</li>
        <li className="rounded-full bg-panel-2 px-2.5 py-1 text-ink-3">✕ never sees the {t}&apos;s joint angles</li>
      </ul>
      <div className="segmented w-fit" role="radiogroup" aria-label="Which layout the learner is tested on">
        <button type="button" role="radio" aria-checked={!newLayout} disabled={busy}
          onClick={() => setNewLayout(false)} className={SEG_ON}>Same layout as the {t}</button>
        <button type="button" role="radio" aria-checked={newLayout} disabled={busy}
          onClick={() => setNewLayout(true)} className={SEG_ON}>A new random layout</button>
      </div>
      {newLayout && <ExactLayout value={exact} onChange={setExact} disabled={busy} />}
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
      <ActButton onClick={() => onLearn(newLayout ? exact ?? randomLayout() : null, mode, onUrsim && ursimReady ? "ursim" : "none")}
        disabled={busy} className="button-primary disabled:cursor-wait disabled:opacity-50">
        {busy ? "Learning…" : `Let the ${l} learn it`}
      </ActButton>
      {run && !busy && (
        <div className="soft-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className={`min-w-0 flex-1 text-base ${run.status === "succeeded" ? "text-ink" : "text-bad"}`}>{describeTransfer(run, t, l)}</p>
          {run.status === "succeeded" && (saved
            ? <p className="text-sm text-good">✓ Saved. It shows in the <Link href="/library" className="underline">Library</Link> as learned from the {t}.</p>
            : <ActButton onClick={onSave} className="button-primary">Save the {l}&apos;s version</ActButton>)}
        </div>
      )}
      {(busy || run) && (
        <RunViewer key={stream.runId ?? "none"} kind="transfer" runId={stream.runId} events={stream.events} run={run} busy={busy}
          names={{ robot: l, teacher: t, robotDof: learner.dof, teacherDof: teacher.dof }} />
      )}
      {run && !busy && (
        <div className="space-y-5">
          {controller && <ControllerPanel execution={controller} />}
          <Disclosure summary={`How the skill was mapped onto the ${l}`} hint="sketches and route order">
            <RunStory run={run} robots={robots} />
          </Disclosure>
          <Disclosure summary="Technical detail" hint="predictions, joints, log">
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
