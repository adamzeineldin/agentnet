"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

/** A frame MuJoCo rendered for the running run, with what it shows ("Physics try 2 of 3: over@0.08"). */
export interface LiveFrame { seq: number; label: string; t: number; image: string }

const POLL_MS = 150;
const RETRY_MS = 1500;
/** Playback runs this far behind the newest frame, so network hiccups do not show as jumps. */
const START_DELAY_S = 0.4;
const MAX_DELAY_S = 2.5;

/**
 * Frames of a running run, played back with the spacing they were rendered at. Polls only while `active`; a
 * request starts after the previous one finished, and each returns every buffered frame since the last one. If
 * frames arrive late, the playback delay grows (up to MAX_DELAY_S) instead of skipping. Fetch errors only slow
 * the polling: the run's own progress stream reports a lost backend.
 */
export function useLiveFrame(runId: string | null, active: boolean): LiveFrame | null {
  // Tagged with its run so a new run never shows the previous run's last frame.
  const [shown, setShown] = useState<{ runId: string; frame: LiveFrame } | null>(null);

  useEffect(() => {
    if (!runId || !active) return;
    let stopped = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    let seq = 0;
    let offset: number | null = null; // playback clock = frame.t + offset (seconds, performance.now based)
    const queue: LiveFrame[] = [];
    const now = () => performance.now() / 1000;

    const receive = (frames: LiveFrame[]) => {
      const fresh = frames.filter((f) => f.seq > seq);
      if (fresh.length === 0) return;
      seq = fresh[fresh.length - 1].seq;
      const first = offset === null;
      if (first) offset = now() - fresh[0].t + START_DELAY_S;
      const lateness = now() - (fresh[0].t + offset!);
      if (!first && lateness > 0) offset = Math.min(offset! + lateness + 0.1, now() - fresh[0].t + MAX_DELAY_S);
      queue.push(...fresh);
    };

    const play = () => {
      if (stopped) return;
      let due: LiveFrame | undefined;
      while (offset !== null && queue.length > 0 && queue[0].t + offset <= now()) due = queue.shift();
      if (due) {
        const frame = due;
        setShown({ runId, frame });
      }
      raf = requestAnimationFrame(play);
    };

    const tick = async () => {
      let wait = POLL_MS;
      try {
        const next = await apiFetch<{ frames: LiveFrame[] } | null>(`/api/runs/${runId}/live?after=${seq}`);
        if (next && !stopped) receive(next.frames);
      } catch {
        wait = RETRY_MS;
      }
      if (!stopped) poll = setTimeout(tick, wait);
    };
    void tick();
    raf = requestAnimationFrame(play);
    return () => {
      stopped = true;
      clearTimeout(poll);
      cancelAnimationFrame(raf);
    };
  }, [runId, active]);

  return shown?.runId === runId ? shown.frame : null;
}
