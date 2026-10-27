"use client";

import { useEffect, useState } from "react";
import { apiFetch, publishSkill, startDiscover, startTransfer } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useRunStream } from "@/lib/useRunStream";
import type { CandidateSummary, ExperienceCapsule, RunRecord, TaskSpec } from "@/lib/types";
import { CandidateCards } from "./CandidateCards";
import { RouteDiagram } from "./RouteDiagram";
import { EventLog } from "./RunEvidence";
import { RunStepper } from "./RunStepper";
import { SourcePanel } from "./transfer/SourcePanel";
import { ImaginationPanel } from "./transfer/ImaginationPanel";
import { TargetPanel } from "./transfer/TargetPanel";
import { ErrorNote, Panel } from "./ui";

const SOURCE = "panda_01";
const TARGET = "ur5e_01";
type Side = "source" | "target";

export function TransferLab() {
  const skillsApi = useApi<ExperienceCapsule[]>(`/api/skills?source_robot_id=${SOURCE}`);
  const skills = skillsApi.data ?? [];
  const source = useRunStream();
  const target = useRunStream();
  const [skillId, setSkillId] = useState<string | null>(null);
  const [seed, setSeed] = useState(42);
  const [active, setActive] = useState<Side>("source");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const { load: loadSource, clear: clearSource } = source;
  const { load: loadTarget, clear: clearTarget } = target;
  const effectiveSkillId = skillId ?? skills[0]?.skill_id ?? null;

  // Replay the recorded source run for the selected skill and its latest transfer, if any.
  useEffect(() => {
    if (!skillsApi.data) return;
    let cancelled = false;
    const capsules = skillsApi.data;
    (async () => {
      if (!effectiveSkillId) {
        const [latest] = await apiFetch<RunRecord[]>(`/api/runs?run_type=discover&robot_id=${SOURCE}&limit=1`);
        if (!cancelled && latest) await loadSource(latest.run_id);
        return;
      }
      const capsule = capsules.find((s) => s.skill_id === effectiveSkillId);
      if (capsule) await loadSource(String(capsule.provenance.run_id));
      else clearSource();
      const transfers = await apiFetch<RunRecord[]>(`/api/runs?run_type=transfer&robot_id=${TARGET}&limit=100`);
      if (cancelled) return;
      const latest = transfers.find((r) => r.results.source_skill_id === effectiveSkillId);
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
  }, [effectiveSkillId, skillsApi.data, loadSource, loadTarget, clearSource, clearTarget]);

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
  const stepperStream = active === "target" ? target : source;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transfer Lab</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Robot A discovers and publishes a verified skill. Robot B retrieves it from the registry, re-places the
          task in its own base frame, orders candidates by Robot A&apos;s experience, solves its own IK, and verifies
          in MuJoCo before publishing an adaptation with lineage.
        </p>
      </div>
      <RunStepper events={stepperStream.events} kind={active === "target" ? "transfer" : "discover"} />
      {[source.error, target.error, skillsApi.error].filter(Boolean).map((e) => <ErrorNote key={e} message={e!} />)}

      <div className="grid gap-4 lg:grid-cols-2">
        <SourcePanel stream={source} skills={skills} selectedSkillId={effectiveSkillId}
          onSelectSkill={setSkillId} seed={seed} onSeed={setSeed}
          onDiscover={() => { setActive("source"); void source.start(() => startDiscover(SOURCE, seed)); }}
          onPublish={() => void publishSource()} />
        <TargetPanel stream={target} sourceSkillId={effectiveSkillId}
          onTransfer={(sceneSeed, mode) => {
            if (!effectiveSkillId) return;
            setActive("target");
            void target.start(() => startTransfer(effectiveSkillId, TARGET, sceneSeed, mode));
          }}
          onPublish={() => void publishTarget()} />
      </div>

      {target.run && <ImaginationPanel run={target.run} />}

      {task && candidates.length > 0 && (
        <Panel title={`Candidate routes · ${active === "target" && target.run ? "UR5e" : "Panda"} · ${task.scene_id}`} right={
          <div className="flex gap-1 text-xs" role="tablist">
            {(["source", "target"] as const).map((side) => (
              <button key={side} role="tab" aria-selected={active === side} disabled={side === "target" && !target.run}
                onClick={() => setActive(side)}
                className={`rounded-md px-2.5 py-1 ${active === side ? "bg-panel-2 text-ink" : "text-ink-3 hover:text-ink"} disabled:opacity-40`}>
                {side === "source" ? "Robot A · Panda" : "Robot B · UR5e"}
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
      {stepperStream.events.length > 0 && <Panel title="Event log"><EventLog events={stepperStream.events} /></Panel>}
    </div>
  );
}
