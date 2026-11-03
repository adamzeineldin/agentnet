"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, subscribeRun } from "./api";
import type { RunEvent, RunRecord } from "./types";

export interface RunStream {
  run: RunRecord | null;
  /** The run being watched, from the moment it is queued (run stays null until it finishes). */
  runId: string | null;
  events: RunEvent[];
  busy: boolean;
  live: boolean;
  error: string | null;
  start: (starter: () => Promise<RunRecord>) => Promise<void>;
  load: (runId: string) => Promise<void>;
  refresh: () => Promise<void>;
  setError: (e: string | null) => void;
  clear: () => void;
}

/** One backend run: start it (live SSE) or load a recorded one (replay). */
export function useRunStream(): RunStream {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubscribe.current?.(), []);

  const load = useCallback(async (runId: string) => {
    try {
      const r = await apiFetch<RunRecord>(`/api/runs/${runId}`);
      setRun(r);
      setRunId(r.run_id);
      setEvents(r.events);
      setLive(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!run) return;
    const r = await apiFetch<RunRecord>(`/api/runs/${run.run_id}`);
    setRun(r);
    setEvents(r.events);
  }, [run]);

  const clear = useCallback(() => {
    setRun(null);
    setRunId(null);
    setEvents([]);
    setLive(false);
  }, []);

  const start = useCallback(async (starter: () => Promise<RunRecord>) => {
    unsubscribe.current?.();
    setBusy(true);
    setError(null);
    setLive(true);
    setRun(null);
    setRunId(null);
    setEvents([]);
    try {
      const queued = await starter();
      setRunId(queued.run_id);
      unsubscribe.current = subscribeRun(queued.run_id, (ev) => setEvents((p) => [...p, ev]), async () => {
        try {
          const r = await apiFetch<RunRecord>(`/api/runs/${queued.run_id}`);
          setRun(r);
          setEvents(r.events);
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
  }, []);

  return { run, runId, events, busy, live, error, start, load, refresh, setError, clear };
}
