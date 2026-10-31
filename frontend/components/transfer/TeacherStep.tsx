"use client";

import type { ExperienceCapsule, RunRecord } from "@/lib/types";
import type { RunStream } from "@/lib/useRunStream";
import { ActButton } from "../auth/SignIn";
import { CandidateCards } from "../CandidateCards";
import { RouteDiagram } from "../RouteDiagram";
import { Term } from "../Term";
import { Disclosure } from "../ui";
import { describeDiscover } from "./describe";
import { RunProgress } from "./RunProgress";
import { RunVideo } from "./RunMedia";
import { skillName } from "./skillName";
import type { CandidateSummary, TaskSpec } from "@/lib/types";

interface TeacherStepProps {
  teacher: string;
  stream: RunStream;
  skills: ExperienceCapsule[];
  skillId: string | null;
  onPickSkill: (id: string) => void;
  layout: number;
  onLayout: (n: number) => void;
  onTeach: () => void;
  onSave: () => void;
}

function Routes({ run }: { run: RunRecord }) {
  const task = run.results.task as TaskSpec | undefined;
  const candidates = (run.results.candidates ?? []) as CandidateSummary[];
  if (!task || candidates.length === 0) return null;
  return (
    <Disclosure summary="Every route it tried" hint={`${candidates.length} routes, with why each failed or passed`}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <RouteDiagram task={task} candidates={candidates} selectedId={(run.results.selected as string) ?? null} />
        <CandidateCards candidates={candidates} selectedId={(run.results.selected as string) ?? null} />
      </div>
    </Disclosure>
  );
}

/** Step 2: the teacher learns a new layout, or a skill it already saved is reused. */
export function TeacherStep({ teacher, stream, skills, skillId, onPickSkill, layout, onLayout, onTeach, onSave }: TeacherStepProps) {
  const { run, busy } = stream;
  const saved = run?.results.published === true;
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ink-2">
        The {teacher} tries up to ten ways past the wall in the physics simulator and keeps the best one that passes.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          <span><Term id="seed">Layout number</Term></span>
          <input type="number" min={0} value={layout} disabled={busy} aria-label="Layout number"
            onChange={(e) => onLayout(Math.max(0, Number.parseInt(e.target.value || "0", 10)))}
            className="tabular w-24 border border-line-strong bg-panel px-3 py-2 text-sm text-ink" />
        </label>
        <ActButton onClick={onTeach} disabled={busy} className="button-primary disabled:cursor-wait disabled:opacity-50">
          {busy ? "Learning…" : `Teach the ${teacher}`}
        </ActButton>
        {skills.length > 0 && (
          <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-3">
            or reuse a skill it already saved
            <select value={skillId ?? ""} disabled={busy} onChange={(e) => onPickSkill(e.target.value)} aria-label="Saved skill"
              className="min-w-0 border border-line-strong bg-panel px-3 py-2 text-sm text-ink">
              {skills.map((s) => <option key={s.skill_id} value={s.skill_id}>{skillName(s)}{s.parent_skill_id ? " (adapted)" : ""}</option>)}
            </select>
          </label>
        )}
      </div>
      {busy && <RunProgress events={stream.events} />}
      {run && !busy && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <RunVideo run={run} busy={false} emptyLabel="" />
          <div className="space-y-3">
            <p className={`text-base ${run.status === "succeeded" ? "text-ink" : "text-bad"}`}>{describeDiscover(run, teacher)}</p>
            {run.status === "succeeded" && (saved
              ? <p className="text-sm text-good">✓ Saved as a skill. Other robots can now learn it.</p>
              : <>
                  <p className="text-sm text-ink-3">Save it so other robots can learn from it.</p>
                  <ActButton onClick={onSave} className="button-primary">Save this skill</ActButton>
                </>)}
            <Routes run={run} />
          </div>
        </div>
      )}
    </div>
  );
}
