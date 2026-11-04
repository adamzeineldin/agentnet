"use client";

import { useState } from "react";
import { randomLayout } from "@/lib/tasks";
import type { ExperienceCapsule, RunRecord } from "@/lib/types";
import type { RunStream } from "@/lib/useRunStream";
import { ActButton } from "../auth/SignIn";
import { CandidateCards } from "../CandidateCards";
import { Disclosure } from "../ui";
import { describeDiscover } from "./describe";
import { ExactLayout } from "./ExactLayout";
import { RunViewer } from "../run/RunViewer";
import { skillName } from "./skillName";
import type { CandidateSummary } from "@/lib/types";

interface TeacherStepProps {
  teacher: string;
  teacherDof: number;
  taskTitle: string;
  stream: RunStream;
  skills: ExperienceCapsule[];
  skillId: string | null;
  onPickSkill: (id: string) => void;
  onTeach: (layout: number) => void;
  onSave: () => void;
}

function Routes({ run }: { run: RunRecord }) {
  const candidates = (run.results.candidates ?? []) as CandidateSummary[];
  if (candidates.length === 0) return null;
  return (
    <Disclosure summary="Every route, in numbers" hint={`${candidates.length} routes`}>
      <CandidateCards candidates={candidates} selectedId={(run.results.selected as string) ?? null} />
    </Disclosure>
  );
}

/** Step 2: the teacher learns a new layout, or a skill it already saved is reused. */
export function TeacherStep({ teacher, teacherDof, taskTitle, stream, skills, skillId, onPickSkill, onTeach, onSave }: TeacherStepProps) {
  const { run, busy } = stream;
  const saved = run?.results.published === true;
  const [exact, setExact] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2"
        title={`The ${teacher} tries up to ten routes in the physics simulator, on a new layout each time, and keeps the best one that passes.`}>
        <span className="rounded-full bg-panel-2 px-3 py-1">Task: <b className="font-medium text-ink">{taskTitle}</b></span>
        <span className="text-xs text-ink-3">up to 10 routes · best one that passes</span>
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <ActButton onClick={() => onTeach(exact ?? randomLayout())} disabled={busy}
          className="button-primary disabled:cursor-wait disabled:opacity-50">
          {busy ? "Learning…" : `Teach the ${teacher}`}
        </ActButton>
        {skills.length > 0 && (
          <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-3">
            or reuse a {taskTitle.toLowerCase()} skill it saved
            <select value={skillId ?? ""} disabled={busy} onChange={(e) => onPickSkill(e.target.value)} aria-label="Saved skill"
              className="min-w-0 border border-line-strong bg-panel px-3 py-2 text-sm text-ink">
              {skills.map((s) => <option key={s.skill_id} value={s.skill_id}>{skillName(s)}{s.parent_skill_id ? " (adapted)" : ""}</option>)}
            </select>
          </label>
        )}
      </div>
      <ExactLayout value={exact} onChange={setExact} disabled={busy} />
      {run && !busy && (
        <div className="soft-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className={`min-w-0 flex-1 text-base ${run.status === "succeeded" ? "text-ink" : "text-bad"}`}>{describeDiscover(run, teacher)}</p>
          {run.status === "succeeded" && (saved
            ? <p className="text-sm text-good">✓ Saved as a skill. Other robots can now learn it.</p>
            : <ActButton onClick={onSave} className="button-primary">Save this skill</ActButton>)}
        </div>
      )}
      {(busy || run) && (
        <RunViewer key={stream.runId ?? "none"} kind="discover" runId={stream.runId} events={stream.events} run={run} busy={busy}
          names={{ robot: teacher, robotDof: teacherDof }} />
      )}
      {run && !busy && <Routes run={run} />}
    </div>
  );
}
