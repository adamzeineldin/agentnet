"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

/** A frame MuJoCo rendered for the running run, with what it shows ("Physics try 2 of 3: over@0.08"). */
export interface LiveFrame { seq: number; label: string; image: string }

const POLL_MS = 150;
const RETRY_MS = 1500;

/**
 * Newest rendered frame of a running run. Polls only while `active`; a request starts after the previous one
 * finished, so a slow connection gets fewer frames rather than a queue. Fetch errors only slow the polling: the
 * run's own progress stream reports a lost backend.
 */
export function useLiveFrame(runId: string | null, active: boolean): LiveFrame | null {
  // Tagged with its run so a new run never shows the previous run's last frame.
  const [latest, setLatest] = useState<{ runId: string; frame: LiveFrame } | null>(null);

  useEffect(() => {
    if (!runId || !active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seq = 0;
    const tick = async () => {
      let wait = POLL_MS;
      try {
        const next = await apiFetch<LiveFrame | null>(`/api/runs/${runId}/live?after=${seq}`);
        if (next && !stopped) {
          seq = next.seq;
          setLatest({ runId, frame: next });
        }
      } catch {
        wait = RETRY_MS;
      }
      if (!stopped) timer = setTimeout(tick, wait);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [runId, active]);

  return latest?.runId === runId ? latest.frame : null;
}
