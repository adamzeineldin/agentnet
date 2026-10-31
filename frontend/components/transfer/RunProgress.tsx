"use client";

import { useEffect, useState } from "react";
import type { RunEvent } from "@/lib/types";

/** What a running job is doing right now, in one line, plus how long it has taken. */
export function RunProgress({ events }: { events: RunEvent[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const last = events.at(-1);
  const started = events[0] ? Date.parse(events[0].at) : now;
  const seconds = Math.max(0, Math.round((now - started) / 1000));
  const waiting = !last || last.status === "queued";
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl bg-panel-2 px-4 py-3 text-sm">
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-accent" />
      <div className="min-w-0">
        <p className="text-ink">{waiting ? "Waiting for its turn on the simulator…" : last.message}</p>
        <p className="mt-0.5 text-xs text-ink-3">
          {waiting
            ? "The shared server runs one simulation at a time, so other people's runs may go first. "
            : "Running in the MuJoCo physics simulator. "}
          {seconds} s so far. You can leave this page; the run keeps going and is saved.
        </p>
      </div>
    </div>
  );
}
