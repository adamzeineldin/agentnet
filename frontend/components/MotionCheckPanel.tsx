"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, startMotionCheck, subscribeRun } from "@/lib/api";
import type { RunEvent, RunRecord } from "@/lib/types";
import { EventLog, RunEvidence } from "./RunEvidence";
import { ErrorNote, Panel } from "./ui";

export function MotionCheckPanel({ robotId, robotName, onFinished }: {
  robotId: string; robotName: string; onFinished?: () => void;
}) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubscribe.current?.(), []);

  async function start() {
    setBusy(true);
    setError(null);
    setRun(null);
    setEvents([]);
    try {
      const queued = await startMotionCheck(robotId);
      unsubscribe.current = subscribeRun(
        queued.run_id,
        (ev) => setEvents((prev) => [...prev, ev]),
        async () => {
          try {
            setRun(await apiFetch<RunRecord>(`/api/runs/${queued.run_id}`));
            onFinished?.();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        },
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Panel title="Live motion check" right={
      <button onClick={start} disabled={busy}
        className="rounded-md border border-accent-dim bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/25 disabled:cursor-wait disabled:opacity-50">
        {busy ? "Running in MuJoCo…" : `Run on ${robotName}`}
      </button>
    }>
      <p className="mb-3 text-xs text-ink-3">
        Jogs the first arm joint, returns home, solves position IK to a fixed target, executes through the
        robot&apos;s own position servos in MuJoCo, and verifies endpoint error, contacts and joint limits.
        No obstacle: this is a capability check, not a skill.
      </p>
      {error && <ErrorNote message={error} />}
      {events.length > 0 && <div className="mb-4"><EventLog events={events} /></div>}
      {run && <RunEvidence run={run} />}
    </Panel>
  );
}
