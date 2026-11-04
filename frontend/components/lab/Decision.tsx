"use client";

import { useState } from "react";
import type { LearningCase, LearningCheck, RobotSummary, SkillMetrics } from "@/lib/types";
import { ActButton } from "../auth/SignIn";
import { Avatar } from "./Avatar";
import { routePhrase } from "../transfer/describe";
import { Badge } from "../ui";
import { Metrics } from "./Metrics";
import { AdaptOptions, LearnOptions, type AdaptChoice } from "./RunOptions";

const CASES: [LearningCase, string][] = [["known", "Replay its skill"], ["adapt", "Adapt another robot's skill"], ["learn", "Learn it directly"]];

/** The three things the Lab can do, with the one the librarian chose lit; the other two stay visible but quiet. */
function CaseTrack({ value }: { value: LearningCase }) {
  return (
    <ol aria-label="What happens next" className="flex flex-wrap gap-1 text-xs">
      {CASES.map(([c, label]) => (
        <li key={c} aria-current={c === value ? "step" : undefined}
          className={`rounded-full px-3 py-1.5 ${c === value ? "bg-ink text-bg" : "text-ink-3"}`}>{label}</li>
      ))}
    </ol>
  );
}

function Who({ m, robots, mine }: { m: SkillMetrics; robots: RobotSummary[]; mine: boolean }) {
  const name = (id: string | null) => robots.find((r) => r.robot_id === id)?.short_name ?? id;
  const how = mine ? (m.learned_from ? `learned from the ${name(m.learned_from)}` : "worked it out itself") : "verified in simulation";
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <Avatar robot={robots.find((r) => r.robot_id === m.robot_id)} size="md" />
      <span><span className="font-medium">The {name(m.robot_id)}&apos;s skill</span> <span className="text-ink-3">· {how}</span></span>
      <span className="text-ink-2">{routePhrase(m.route)}</span>
    </p>
  );
}

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
}

/** What the librarian found for this robot and task, and the one next step it leads to. */
export function Decision({ check, robot, robots, busy, onReplay, onImprove, onAdapt, onLearn }: DecisionProps) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [choice, setChoice] = useState<AdaptChoice>({ mode: "offline", executeOn: "none" });
  const [layout, setLayout] = useState<number | null>(null);
  const name = (id: string) => robots.find((r) => r.robot_id === id)?.short_name ?? id;
  const me = robot.short_name;
  const source = check.sources.find((s) => s.skill_id === sourceId) ?? check.sources[0];
  const next = check.improve_sources[0];

  return (
    <section aria-label="What the librarian found" className="soft-card space-y-4 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CaseTrack value={check.case} />
        <Badge title="Decided from saved, simulation-verified skills by fixed rules">Librarian rules · no model call</Badge>
      </div>
      <p className="max-w-3xl text-lg font-light leading-snug tracking-[-0.01em]">{check.reason}</p>
      {check.requested_note && <p className="rounded-xl bg-panel-2/70 px-3.5 py-2.5 text-sm">{check.requested_note}</p>}

      {check.case === "known" && check.existing && (
        <div className="space-y-4">
          <Who m={check.existing} robots={robots} mine />
          <Metrics m={check.existing} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onReplay} disabled={busy} className="button-primary disabled:opacity-50">▶ Replay its simulation</button>
            {next && (
              <ActButton onClick={() => onImprove(next)} disabled={busy} className="button-secondary disabled:opacity-50">
                {check.already_tried.length ? `Try the ${name(next.robot_id)}'s experience too` : "Improve this skill"}
              </ActButton>
            )}
          </div>
          <p className="text-xs text-ink-3">
            {next
              ? `Improving tries the ${name(next.robot_id)}'s skill on this same layout and keeps it only if it is verified, safe and faster or shorter.`
              : "No other robot has an untried skill of this task to improve it with."}
            {check.already_tried.length > 0 && ` Already tried: ${check.already_tried.length}.`}
          </p>
        </div>
      )}

      {check.case === "adapt" && source && (
        <div className="space-y-4">
          {check.sources.length > 1 && (
            <div role="radiogroup" aria-label="Learn from" className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="mr-1 text-xs text-ink-3">Learn from</span>
              {check.sources.map((s, i) => (
                <button key={s.skill_id} type="button" role="radio" aria-checked={s.skill_id === source.skill_id} disabled={busy}
                  onClick={() => setSourceId(s.skill_id)}
                  className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors ${
                    s.skill_id === source.skill_id ? "bg-ink text-bg" : "text-ink-2 hover:bg-panel-2"}`}>
                  <Avatar robot={robots.find((r) => r.robot_id === s.robot_id)} />{name(s.robot_id)}
                  {i === 0 && <span className="text-[11px] opacity-70">best match</span>}
                </button>
              ))}
            </div>
          )}
          <Who m={source} robots={robots} mine={false} />
          <ActButton onClick={() => onAdapt(source, choice)} disabled={busy} className="button-primary disabled:opacity-50">
            {`Adapt it to the ${me}`}
          </ActButton>
          <p className="text-xs text-ink-3">
            The {me} gets the task&apos;s geometry and the {name(source.robot_id)}&apos;s route, never its joint angles, and solves
            its own motion. If it passes the physics test it is saved to the Library.
          </p>
          <AdaptOptions robot={robot} value={choice} disabled={busy} onChange={setChoice} />
        </div>
      )}

      {check.case === "learn" && (
        <div className="space-y-4">
          <ActButton onClick={() => onLearn(layout)} disabled={busy} className="button-primary disabled:opacity-50">
            {`Let the ${me} learn it`}
          </ActButton>
          <p className="text-xs text-ink-3">
            The {me} tries up to ten routes in the physics simulator and keeps the best one that passes. A verified result is
            saved to the Library, so other robots can learn from it later.
          </p>
          <LearnOptions layout={layout} disabled={busy} onChange={setLayout} />
        </div>
      )}
    </section>
  );
}
