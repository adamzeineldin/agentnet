"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, publishSkill, startDiscover, startTransfer } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useRunStream } from "@/lib/useRunStream";
import type { CandidateSummary, ExperienceCapsule, RobotSummary, RunRecord, TaskSpec } from "@/lib/types";
import { CandidateCards } from "./CandidateCards";
import { RouteDiagram } from "./RouteDiagram";
import { EventLog } from "./RunEvidence";
import { RunStepper } from "./RunStepper";
import { ImaginationPanel } from "./transfer/ImaginationPanel";
import { JointCorrespondence } from "./transfer/JointCorrespondence";
import { RobotPair } from "./transfer/RobotPair";
import { SourcePanel } from "./transfer/SourcePanel";
import { TargetPanel } from "./transfer/TargetPanel";
import { Disclosure, ErrorNote, Loading, PageHeader, Panel } from "./ui";

const DEFAULT_SOURCE = "panda_01";
const DEFAULT_TARGET = "ur5e_01";
type Side = "source" | "target";

/** Teacher and learner from ?source= / ?target=, falling back to the default pair, always two different fleet arms. */
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
  if (!robots.data) return <Loading label="Loading the fleet…" />;
  if (robots.data.length < 2) return <ErrorNote message="Transfer needs at least two robots in the fleet." />;
  return <Lab robots={robots.data} />;
}

function Lab({ robots }: { robots: RobotSummary[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const [sourceId, targetId] = pickPair(robots, params.get("source"), params.get("target"));
  const sourceRobot = robots.find((r) => r.robot_id === sourceId)!;
  const targetRobot = robots.find((r) => r.robot_id === targetId)!;
  const skillsApi = useApi<ExperienceCapsule[]>(`/api/skills?source_robot_id=${sourceId}`);
  const skills = skillsApi.data ?? [];
  const source = useRunStream();
  const target = useRunStream();
  const [skillId, setSkillId] = useState<string | null>(null);
  const [seed, setSeed] = useState(42);
  const [active, setActive] = useState<Side>("source");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const { load: loadSource, clear: clearSource } = source;
  const { load: loadTarget, clear: clearTarget } = target;
  const effectiveSkillId = (skillId && skills.some((s) => s.skill_id === skillId) ? skillId : null)
    ?? skills.find((s) => s.skill_id === params.get("skill"))?.skill_id ?? skills[0]?.skill_id ?? null;
  const busy = source.busy || target.busy;

  function choosePair(s: string, t: string) {
    setSkillId(null);
    router.replace(`/transfer?source=${s}&target=${t}`, { scroll: false });
  }

  // Show the recorded run behind the selected skill, and its latest transfer to this learner, if any.
  useEffect(() => {
    if (!skillsApi.data) return;
    let cancelled = false;
    const capsules = skillsApi.data;
    (async () => {
      if (!effectiveSkillId) {
        const [latest] = await apiFetch<RunRecord[]>(`/api/runs?run_type=discover&robot_id=${sourceId}&limit=1`);
        if (cancelled) return;
        if (latest) await loadSource(latest.run_id); else clearSource();
        clearTarget();
        return;
      }
      const capsule = capsules.find((s) => s.skill_id === effectiveSkillId);
      if (capsule) await loadSource(String(capsule.provenance.run_id));
      else clearSource();
      const transfers = await apiFetch<RunRecord[]>(`/api/runs?run_type=transfer&robot_id=${targetId}&limit=100`);
      if (cancelled) return;
      const latest = transfers.find((r) => r.results.source_skill_id === effectiveSkillId && r.target_robot_id === targetId);
      if (latest) {
        await loadTarget(latest.run_id);
        setActive("target");
      } else {
        clearTarget();
        setActive("source");
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [effectiveSkillId, skillsApi.data, sourceId, targetId, loadSource, loadTarget, clearSource, clearTarget]);

  async function publishSource() {
    if (!source.run) return;
    try {
      const capsule = await publishSkill(source.run.run_id);
      await source.refresh();
      skillsApi.reload();
      setSkillId(capsule.skill_id);
    } catch (e) {
      source.setError((e as Error).message);
    }
  }

  async function publishTarget() {
    if (!target.run) return;
    try {
      await publishSkill(target.run.run_id);
      await target.refresh();
    } catch (e) {
      target.setError((e as Error).message);
    }
  }

  const shown = active === "target" && target.run ? target : source;
  const candidates = (shown.run?.results.candidates ?? []) as CandidateSummary[];
  const task = shown.run?.results.task as TaskSpec | undefined;
  const selected = (shown.run?.results.selected as string | undefined) ?? null;
  const liveStream = target.busy ? target : source.busy ? source : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Teach and adapt" title="Transfer Lab" guide="steps" here="/transfer">
        Pick two arms. The teacher learns to reach past a wall and saves what worked as a skill. The learner, with a
        different body, takes that skill, plans its own motion and has to pass a physics test.
      </PageHeader>
      <RobotPair robots={robots} source={sourceId} target={targetId} disabled={busy} onChange={choosePair} />
      {liveStream && <RunStepper events={liveStream.events} kind={liveStream === target ? "transfer" : "discover"} />}
      {[source.error, target.error, skillsApi.error].filter(Boolean).map((e) => <ErrorNote key={e} message={e!} />)}

      <div className="grid gap-6 lg:grid-cols-2">
        <SourcePanel robotName={sourceRobot.short_name} stream={source} skills={skills} selectedSkillId={effectiveSkillId}
          onSelectSkill={setSkillId} seed={seed} onSeed={setSeed}
          onDiscover={() => { setActive("source"); void source.start(() => startDiscover(sourceId, seed)); }}
          onPublish={() => void publishSource()} />
        <TargetPanel robot={targetRobot} teacherName={sourceRobot.short_name} stream={target} sourceSkillId={effectiveSkillId}
          onTransfer={(sceneSeed, mode, executeOn) => {
            if (!effectiveSkillId) return;
            setActive("target");
            void target.start(() => startTransfer(effectiveSkillId, targetId, sceneSeed, mode, executeOn));
          }}
          onPublish={() => void publishTarget()} />
      </div>

      <Disclosure summary="How the learner decided" hint="routes tried, predicted outcomes, joints and the full log">
        <div className="space-y-6">
          <p className="text-sm text-ink-2">
            Want the plain-language version? <Link href="/under-the-hood" className="text-accent hover:underline">Under the hood</Link> walks
            through a recorded transfer one step at a time.
          </p>
          {target.run && <ImaginationPanel run={target.run} />}
          {task && candidates.length > 0 && (
            <Panel title={`Routes tried · ${active === "target" && target.run ? targetRobot.short_name : sourceRobot.short_name} · ${task.scene_id}`} right={
              <div className="segmented" role="tablist">
                {(["source", "target"] as const).map((side) => (
                  <button key={side} role="tab" aria-selected={active === side} disabled={side === "target" && !target.run}
                    onClick={() => setActive(side)} className="disabled:opacity-40">
                    {side === "source" ? sourceRobot.short_name : targetRobot.short_name}
                  </button>
                ))}
              </div>
            }>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
                <RouteDiagram task={task} candidates={candidates} selectedId={selected} hoverId={hoverId} onHover={setHoverId} />
                <CandidateCards candidates={candidates} selectedId={selected} hoverId={hoverId} onHover={setHoverId} />
              </div>
            </Panel>
          )}
          <JointCorrespondence sourceId={sourceId} targetId={targetId} />
          {shown.events.length > 0 && <Panel title="Event log"><EventLog events={shown.events} /></Panel>}
        </div>
      </Disclosure>
    </div>
  );
}
