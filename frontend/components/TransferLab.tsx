"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, apiUrl, publishSkill, startDiscover, subscribeRun } from "@/lib/api";
import { fmtM, fmtSec } from "@/lib/format";
import type { CandidateSummary, RunEvent, RunRecord, TaskSpec } from "@/lib/types";
import { CandidateCards } from "./CandidateCards";
import { RouteDiagram } from "./RouteDiagram";
import { EventLog } from "./RunEvidence";
import { RunStepper } from "./RunStepper";
import { Badge, ErrorNote, Panel, Stat, StatusBadge } from "./ui";

const SOURCE = "panda_01";
const TARGET = "ur5e_01";

export function TransferLab() {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(42);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<RunRecord[]>(`/api/runs?run_type=discover&robot_id=${SOURCE}&limit=1`)
      .then(([latest]) => {
        if (!cancelled && latest) {
          setRun(latest);
          setEvents(latest.events);
          setSeed(latest.task_seed);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      unsubscribe.current?.();
    };
  }, []);

  async function refresh(runId: string) {
    const r = await apiFetch<RunRecord>(`/api/runs/${runId}`);
    setRun(r);
    setEvents(r.events);
  }

  async function discover() {
    setBusy(true);
    setError(null);
    setLive(true);
    setEvents([]);
    setRun(null);
    try {
      const queued = await startDiscover(SOURCE, seed);
      unsubscribe.current = subscribeRun(queued.run_id, (ev) => setEvents((p) => [...p, ev]), async () => {
        try {
          await refresh(queued.run_id);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function publish() {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      await publishSkill(run.run_id);
      await refresh(run.run_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const candidates = (run?.results.candidates ?? []) as CandidateSummary[];
  const task = run?.results.task as TaskSpec | undefined;
  const selected = (run?.results.selected as string | undefined) ?? null;
  const published = run?.results.published === true;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transfer Lab</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            Robot A searches candidate routes around the obstacle, MuJoCo screens and simulates them, and the
            verified winner becomes a publishable Experience Capsule.
          </p>
        </div>
        {run && <Badge tone={live ? "accent" : "neutral"}>{live ? "● live run" : `replay of recorded run ${run.run_id.slice(-6)}`}</Badge>}
      </div>
      <RunStepper events={events} />
      {error && <ErrorNote message={error} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Source · Robot A · Panda" right={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ink-3">scene seed
              <input type="number" min={0} value={seed} disabled={busy}
                onChange={(e) => setSeed(Math.max(0, Number.parseInt(e.target.value || "0", 10)))}
                className="tabular w-20 rounded-md border border-line bg-panel-2 px-2 py-1 text-ink" />
            </label>
            <button onClick={discover} disabled={busy}
              className="rounded-md border border-accent-dim bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/25 disabled:cursor-wait disabled:opacity-50">
              {busy && live ? "Discovering…" : "Discover Skill"}
            </button>
          </div>
        }>
          {run?.artifacts.video ? (
            <video key={run.artifacts.video} src={apiUrl(run.artifacts.video)} poster={run.artifacts.poster ? apiUrl(run.artifacts.poster) : undefined}
              controls autoPlay muted playsInline loop className="aspect-video w-full rounded-lg border border-line bg-black" />
          ) : (
            <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-line text-xs text-ink-3">
              {busy ? "Searching and simulating in MuJoCo…" : run ? "No execution video (run did not reach execution)" : "No discovery run yet"}
            </div>
          )}
          {run && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={run.status} />
                <Badge>{run.simulator}</Badge><Badge>seed {run.task_seed}</Badge><Badge>{run.planner}</Badge>
              </div>
              {task && <p className="text-xs text-ink-2">{task.description}</p>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Endpoint error" value={fmtM(run.endpoint_error_m, 2)} />
                <Stat label="Collisions" value={run.collision_count ?? "—"} />
                <Stat label="Candidates" value={candidates.length || "—"} hint={`${candidates.filter((c) => c.outcome === "verified").length} verified`} />
                <Stat label="Wall clock" value={fmtSec(run.wall_clock_seconds)} />
              </div>
              {run.status === "succeeded" && (
                <div className="flex items-center gap-3 border-t border-line pt-3">
                  <button onClick={publish} disabled={busy || published}
                    className="rounded-md border border-good/50 bg-good/10 px-3 py-1.5 text-sm font-medium text-good hover:bg-good/20 disabled:opacity-60">
                    {published ? "✓ Published" : "Publish Experience"}
                  </button>
                  <span className="font-mono text-[11px] text-ink-3">{run.skill_id}</span>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Target · Robot B · UR5e">
          {/* eslint-disable-next-line @next/next/no-img-element -- MuJoCo render served by backend */}
          <img src={apiUrl(`/artifacts/snapshots/${TARGET}.png`)} alt="UR5e at home pose"
            className="aspect-video w-full rounded-lg border border-line object-cover opacity-60" />
          <div className="mt-4 space-y-2">
            <button disabled title="Cross-robot transfer is Milestone 3"
              className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 text-sm text-ink-3">
              Transfer Skill
            </button>
            <p className="text-xs text-ink-3">
              Not built yet (Milestone 3). The UR5e will retrieve the published capsule, re-solve its own IK from
              task-frame geometry, and verify candidates in MuJoCo.
            </p>
          </div>
        </Panel>
      </div>

      {task && candidates.length > 0 && (
        <Panel title={`Candidate routes · ${task.scene_id}`}>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <RouteDiagram task={task} candidates={candidates} selectedId={selected} hoverId={hoverId} onHover={setHoverId} />
            <CandidateCards candidates={candidates} selectedId={selected} hoverId={hoverId} onHover={setHoverId} />
          </div>
        </Panel>
      )}
      {events.length > 0 && <Panel title="Event log"><EventLog events={events} /></Panel>}
    </div>
  );
}
