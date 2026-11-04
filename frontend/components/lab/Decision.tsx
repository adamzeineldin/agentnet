"use client";

import { useState } from "react";
import type { LearningCheck, RobotSummary, SkillMetrics } from "@/lib/types";
import { fmtSec } from "@/lib/format";
import { ActButton } from "../auth/SignIn";
import { routePhrase } from "../transfer/describe";
import { Badge } from "../ui";
import { Metrics } from "./Metrics";
import { RobotMenu, type MenuOption } from "./RobotMenu";
import { AdaptOptions, LearnOptions, type AdaptChoice } from "./RunOptions";

export interface DecisionActions {
  onReplay: () => void;
  onImprove: (source: SkillMetrics) => void;
  onAdapt: (source: SkillMetrics, choice: AdaptChoice) => void;
  onLearn: (layout: number | null) => void;
}

interface DecisionProps extends DecisionActions {
  check: LearningCheck;
  robot: RobotSummary;
  robots: RobotSummary[];
  busy: boolean;
  /** Clear the task and start over. */
  onClearTask: () => void;
}

/** The headline: what the library holds, in a few words. The button under it says what happens next. */
function headline(check: LearningCheck, me: string, name: (id: string) => string): string {
  if (check.case === "known") return `The ${me} already knows this.`;
  if (check.case === "learn") return "No robot knows this yet.";
  const n = check.sources.length;
  return n === 1 ? `New to the ${me}. The ${name(check.sources[0].robot_id)} knows it.` : `New to the ${me}. ${n} robots know it.`;
}

/** Where a skill came from, in a few quiet words under the robot. */
function origin(m: SkillMetrics, name: (id: string) => string): string {
  const how = m.learned_from ? `learned from the ${name(m.learned_from)}` : "worked out by itself";
  return `${routePhrase(m.route)} · ${how}`;
}

/** What the librarian found for this robot and task, and the one step it leads to. */
export function Decision({ check, robot, robots, busy, onClearTask, onReplay, onImprove, onAdapt, onLearn }: DecisionProps) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [choice, setChoice] = useState<AdaptChoice>({ mode: "offline", executeOn: "none" });
  const [layout, setLayout] = useState<number | null>(null);
  const byId = (id: string) => robots.find((r) => r.robot_id === id);
  const name = (id: string) => byId(id)?.short_name ?? id;
  const me = robot.short_name;
  const source = check.sources.find((s) => s.skill_id === sourceId) ?? check.sources[0];
  const next = check.improve_sources[0];
  const sourceOptions: MenuOption[] = check.sources.map((s, i) => ({
    id: s.skill_id, robot: byId(s.robot_id), label: name(s.robot_id), note: i === 0 ? "best match" : undefined,
    detail: `${byId(s.robot_id)?.dof ?? "?"} joints · ${fmtSec(s.execution_s)} · ${routePhrase(s.route)}`,
  }));

  return (
    <section aria-label="What the librarian found" data-case={check.case} className="soft-card space-y-5 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p role="group" aria-label="Chosen task" className="flex items-center gap-2 text-xs text-ink-3">
            <span className="text-ink-2">{check.task_title}</span>
            <button type="button" disabled={busy} onClick={onClearTask} className="hover:text-ink disabled:opacity-40">Change</button>
          </p>
          <h2 className="text-xl font-light tracking-[-0.01em]">{headline(check, me, name)}</h2>
        </div>
        <Badge title="Decided from saved, simulation-verified skills by fixed rules">Librarian rules · no model call</Badge>
      </div>
      {check.requested_note && <p className="rounded-xl bg-panel-2/70 px-3.5 py-2.5 text-sm">{check.requested_note}</p>}

      {check.case === "known" && check.existing && (
        <>
          <p className="text-sm text-ink-3">{origin(check.existing, name)}</p>
          <Metrics m={check.existing} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <button type="button" onClick={onReplay} disabled={busy} className="button-primary disabled:opacity-50">▶ Replay its simulation</button>
            {next && (
              <ActButton onClick={() => onImprove(next)} disabled={busy} className="text-sm text-accent hover:underline disabled:opacity-50"
                title={`Tries the ${name(next.robot_id)}'s skill on this same layout; kept only if verified, safe and faster or shorter.`}>
                {`Try to improve it with the ${name(next.robot_id)}'s skill`}
              </ActButton>
            )}
          </div>
          {!next && <p className="text-xs text-ink-3">No other robot has an untried skill of this task to improve it with.</p>}
        </>
      )}

      {check.case === "adapt" && source && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs text-ink-3">Learn from</span>
            <RobotMenu label="Learn from" options={sourceOptions} value={source.skill_id} disabled={busy} onPick={setSourceId} />
            <span className="text-xs text-ink-3">{routePhrase(source.route)}</span>
          </div>
          <Metrics m={source} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <ActButton onClick={() => onAdapt(source, choice)} disabled={busy} className="button-primary disabled:opacity-50"
              title={`The ${me} gets the task's geometry and the route, never joint angles, and solves its own motion.`}>
              {`Adapt it to the ${me}`}
            </ActButton>
            <span className="text-xs text-ink-3">Saved only if it passes the physics test.</span>
          </div>
          <AdaptOptions robot={robot} value={choice} disabled={busy} onChange={setChoice} />
        </>
      )}

      {check.case === "learn" && (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <ActButton onClick={() => onLearn(layout)} disabled={busy} className="button-primary disabled:opacity-50"
              title="Tries up to ten routes in the physics simulator and keeps the best one that passes.">
              {`Let the ${me} learn it`}
            </ActButton>
            <span className="text-xs text-ink-3">Saved only if it passes the physics test.</span>
          </div>
          <LearnOptions layout={layout} disabled={busy} onChange={setLayout} />
        </>
      )}
    </section>
  );
}
