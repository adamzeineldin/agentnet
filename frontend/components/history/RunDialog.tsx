"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TERMINAL } from "@/lib/types";
import type { ReasoningTrace, RobotSummary, RunRecord } from "@/lib/types";
import { LineageGraph } from "../LineageGraph";
import { RunViewer } from "../run/RunViewer";
import { RunScreen } from "../run/RunScreen";
import { EventLog, RunEvidence } from "../RunEvidence";
import { describeDiscover, describeTransfer } from "../transfer/describe";
import { ProviderBadge } from "../transfer/ImaginationPanel";
import { Badge, Disclosure, ErrorNote, Loading } from "../ui";
import { RUN_KIND } from "./runKinds";

const POLL_MS = 1500;

function Summary({ run, robots }: { run: RunRecord; robots: RobotSummary[] }) {
  const name = (id: string | null) => robots.find((r) => r.robot_id === id)?.short_name ?? id ?? "robot";
  if (!TERMINAL.has(run.status)) return null;
  const text = run.run_type === "discover" ? describeDiscover(run, name(run.source_robot_id))
    : run.run_type === "transfer" ? describeTransfer(run, name(run.source_robot_id), name(run.target_robot_id))
    : run.events.at(-1)?.message;
  return <p className={`text-base ${run.status === "succeeded" ? "text-ink" : "text-bad"}`}>{text}</p>;
}

function Body({ run, robots }: { run: RunRecord; robots: RobotSummary[] }) {
  const busy = !TERMINAL.has(run.status);
  const robot = (id: string | null) => robots.find((r) => r.robot_id === id);
  const learner = robot(run.target_robot_id ?? run.source_robot_id);
  const teacher = robot(run.source_robot_id);
  const sourceSkill = run.results.source_skill_id as string | undefined;
  const published = run.results.published === true;
  const searched = run.run_type === "discover" || run.run_type === "transfer";
  return (
    <div className="space-y-5">
      <Summary run={run} robots={robots} />
      {searched ? (
        <RunViewer kind={run.run_type === "discover" ? "discover" : "transfer"} runId={run.run_id} events={run.events}
          run={busy ? null : run} busy={busy}
          names={{
            robot: learner?.short_name ?? run.target_robot_id ?? run.source_robot_id ?? "robot",
            robotDof: learner?.dof,
            teacher: run.run_type === "transfer" ? teacher?.short_name ?? run.source_robot_id ?? undefined : undefined,
            teacherDof: run.run_type === "transfer" ? teacher?.dof : undefined,
          }} />
      ) : busy ? (
        <RunScreen runId={run.run_id} run={null} busy view={{ kind: "live" }} lastStatus={run.status} hasTries={false} onBack={() => undefined} />
      ) : null}
      <Disclosure summary="Evidence and full log" hint="checks, numbers, provenance and every progress message" open={!searched && !busy}>
        <div className="space-y-4">
          <RunEvidence run={run} split={!searched} />
          {run.run_type === "transfer" && (
            <div className="flex flex-wrap gap-2"><ProviderBadge trace={run.results.reasoning as ReasoningTrace | undefined} />
              {run.model_used && <Badge tone="accent">model {run.model_used}</Badge>}</div>
          )}
          {(run.skill_id || sourceSkill) && (
            <div>
              <div className="mb-1 text-[11px] tracking-wide text-ink-3 uppercase">Skill family</div>
              {published && run.skill_id ? <LineageGraph skillId={run.skill_id} />
                : sourceSkill ? <LineageGraph skillId={sourceSkill} />
                : <p className="text-xs text-ink-3">Produced a skill draft that was not saved.</p>}
            </div>
          )}
          <div className="border-t border-line pt-3"><EventLog events={run.events} /></div>
        </div>
      </Disclosure>
    </div>
  );
}

/** The full run record, re-read every POLL_MS until it finishes. */
function useRunRecord(runId: string): { run: RunRecord | null; error: string | null } {
  const [state, setState] = useState<{ runId: string; run: RunRecord | null; error: string | null }>({ runId, run: null, error: null });
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const run = await apiFetch<RunRecord>(`/api/runs/${runId}`);
        if (stopped) return;
        setState({ runId, run, error: null });
        if (!TERMINAL.has(run.status)) timer = setTimeout(read, POLL_MS);
      } catch (e) {
        if (stopped) return;
        setState((prev) => ({ ...prev, runId, error: (e as Error).message }));
        timer = setTimeout(read, POLL_MS * 2);
      }
    };
    void read();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [runId]);
  return state.runId === runId ? state : { run: null, error: null };
}

/** One run, opened over the list (so it is always in view), loaded in full and kept fresh while it runs. */
interface RunDialogProps {
  runId: string;
  robots: RobotSummary[];
  onClose: () => void;
  /** Show the skill this run saved, on its layout in the library. */
  onShowSkill?: (sceneId: string) => void;
}

export function RunDialog({ runId, robots, onClose, onShowSkill }: RunDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { run, error } = useRunRecord(runId);
  const name = (id: string | null) => robots.find((r) => r.robot_id === id)?.short_name ?? id;
  const scene = (run?.results.task as { scene_id?: string } | undefined)?.scene_id;
  const skillScene = run?.results.published === true && scene ? scene : null;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={ref} aria-labelledby="run-dialog-title" onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close()}
      className="menu-pop m-auto max-h-[92vh] w-[min(96vw,72rem)] overflow-y-auto overscroll-contain rounded-[20px] border border-line bg-panel p-5 text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="run-dialog-title" className="text-lg font-medium">{run ? RUN_KIND[run.run_type]?.title ?? run.run_type : "Run"}</h2>
          {run && <p className="mt-0.5 truncate text-xs text-ink-3">
            {[run.source_robot_id, run.target_robot_id].filter(Boolean).map(name).join(" → ") || "all robots"} · layout {run.task_seed} · {run.run_id}
          </p>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {skillScene && onShowSkill && (
            <button type="button" onClick={() => onShowSkill(skillScene)} className="pill">
              Its saved skill →</button>
          )}
          <button type="button" onClick={() => ref.current?.close()} className="pill" aria-label="Close run">Close ✕</button>
        </div>
      </header>
      {error && <ErrorNote message={error} />}
      {!run && !error && <Loading label="Loading the run…" />}
      {run && <Body run={run} robots={robots} />}
    </dialog>
  );
}
