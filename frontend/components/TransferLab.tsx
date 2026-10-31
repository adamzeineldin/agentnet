"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, publishSkill, startDiscover, startTransfer } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useRunStream } from "@/lib/useRunStream";
import type { ExperienceCapsule, RobotSummary, RunRecord } from "@/lib/types";
import { LearnerStep } from "./transfer/LearnerStep";
import { RobotPair } from "./transfer/RobotPair";
import { StepCard } from "./transfer/StepCard";
import { TeacherStep } from "./transfer/TeacherStep";
import { ErrorNote, Loading, PageHeader } from "./ui";

const DEFAULT_SOURCE = "panda_01";
const DEFAULT_TARGET = "ur5e_01";

/** Teacher and learner from ?source= / ?target=, falling back to the default pair; always two different fleet arms. */
function pickPair(robots: RobotSummary[], source: string | null, target: string | null): [string, string] {
  const ids = robots.map((r) => r.robot_id);
  const s = source && ids.includes(source) ? source : ids.includes(DEFAULT_SOURCE) ? DEFAULT_SOURCE : ids[0];
  const t = target && ids.includes(target) && target !== s ? target
    : DEFAULT_TARGET !== s && ids.includes(DEFAULT_TARGET) ? DEFAULT_TARGET : ids.find((id) => id !== s)!;
  return [s, t];
}

export function TransferLab() {
  const robots = useApi<RobotSummary[]>("/api/robots");
  if (robots.error) return <ErrorNote message={robots.error} />;
  if (!robots.data) return <Loading label="Loading the robots…" />;
  if (robots.data.length < 2) return <ErrorNote message="Trying it needs at least two robots in the fleet." />;
  return <TryIt robots={robots.data} />;
}

function TryIt({ robots }: { robots: RobotSummary[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const [sourceId, targetId] = pickPair(robots, params.get("source"), params.get("target"));
  const teacher = robots.find((r) => r.robot_id === sourceId)!;
  const learner = robots.find((r) => r.robot_id === targetId)!;
  const skillsApi = useApi<ExperienceCapsule[]>(`/api/skills?source_robot_id=${sourceId}`);
  const skills = skillsApi.data ?? [];
  const source = useRunStream();
  const target = useRunStream();
  const [skillId, setSkillId] = useState<string | null>(null);
  const [layout, setLayout] = useState(42);
  const { load: loadSource, clear: clearSource } = source;
  const { load: loadTarget, clear: clearTarget } = target;
  const skill = skills.find((s) => s.skill_id === skillId)
    ?? skills.find((s) => s.skill_id === params.get("skill")) ?? skills[0] ?? null;
  const busy = source.busy || target.busy;
  // A fresh, unsaved discovery replaces the saved skill as what step 2 shows.
  const fresh = source.live && source.run !== null;

  function choosePair(s: string, t: string) {
    setSkillId(null);
    clearSource();
    clearTarget();
    router.replace(`/transfer?source=${s}&target=${t}`, { scroll: false });
  }

  // Show the run behind the chosen skill, and its latest attempt by this learner, if any.
  useEffect(() => {
    if (!skillsApi.data || fresh) return;
    let cancelled = false;
    (async () => {
      if (!skill) {
        clearSource();
        clearTarget();
        return;
      }
      await loadSource(String(skill.provenance.run_id));
      const transfers = await apiFetch<RunRecord[]>(`/api/runs?run_type=transfer&robot_id=${targetId}&limit=100`);
      if (cancelled) return;
      const latest = transfers.find((r) => r.results.source_skill_id === skill.skill_id && r.target_robot_id === targetId);
      if (latest) await loadTarget(latest.run_id); else clearTarget();
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [skill, skillsApi.data, fresh, targetId, loadSource, loadTarget, clearSource, clearTarget]);

  async function saveTeacher() {
    if (!source.run) return;
    try {
      const capsule = await publishSkill(source.run.run_id);
      await source.refresh();
      setSkillId(capsule.skill_id);
      skillsApi.reload();
    } catch (e) {
      source.setError((e as Error).message);
    }
  }

  async function saveLearner() {
    if (!target.run) return;
    try {
      await publishSkill(target.run.run_id);
      await target.refresh();
    } catch (e) {
      target.setError((e as Error).message);
    }
  }

  const teacherReady = !fresh && skill !== null;
  const teacherDone = teacherReady || source.run?.results.published === true;
  const learnSkill = fresh
    ? (source.run?.results.published ? skills.find((s) => s.skill_id === skillId) ?? null : null)
    : skill;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader eyebrow="Try it" title="Teach one robot, watch another learn" guide="steps">
        Three steps. Pick two robot arms, let the first one learn to reach past a wall, then see whether the second one,
        with a different body, can learn it from the first.
      </PageHeader>
      {[source.error, target.error, skillsApi.error].filter(Boolean).map((e) => <ErrorNote key={e} message={e!} />)}

      <StepCard n={1} title="Pick a teacher and a learner" state="done">
        <RobotPair robots={robots} source={sourceId} target={targetId} disabled={busy} onChange={choosePair} />
      </StepCard>

      <StepCard n={2} title={`The ${teacher.short_name} learns the task`} state={teacherDone ? "done" : "active"}>
        <TeacherStep teacher={teacher.short_name} stream={source} skills={skills} skillId={skill?.skill_id ?? null}
          onPickSkill={(id) => { setSkillId(id); clearSource(); }}
          layout={layout} onLayout={setLayout}
          onTeach={() => { clearTarget(); void source.start(() => startDiscover(sourceId, layout)); }}
          onSave={() => void saveTeacher()} />
      </StepCard>

      <StepCard n={3} title={`The ${learner.short_name} learns it from the ${teacher.short_name}`}
        state={!learnSkill ? "locked" : target.run?.status === "succeeded" ? "done" : "active"}
        lockedNote={`First let the ${teacher.short_name} learn the task and save it (step 2).`}>
        {learnSkill && (
          <LearnerStep teacher={teacher} learner={learner} robots={robots} stream={target} teacherLayout={learnSkill.task.seed}
            onLearn={(sceneSeed, mode, executeOn) =>
              void target.start(() => startTransfer(learnSkill.skill_id, targetId, sceneSeed, mode, executeOn))}
            onSave={() => void saveLearner()} />
        )}
      </StepCard>
    </div>
  );
}
