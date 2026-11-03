import type { RunEvent, RunStatus } from "@/lib/types";

export type RunKind = "discover" | "transfer";
export type StageKey = "skill" | "setup" | "routes" | "check" | "rank" | "physics" | "record";
export type StageState = "done" | "active" | "failed" | "pending" | "skipped";

const ORDER: Record<RunKind, StageKey[]> = {
  discover: ["setup", "routes", "check", "physics", "record"],
  transfer: ["skill", "setup", "check", "rank", "physics", "record"],
};

/** Which stage a progress event belongs to. Compatibility checks happen while the task is being set up. */
function stageOf(kind: RunKind, ev: RunEvent): StageKey | null {
  const by: Partial<Record<RunStatus, StageKey>> = kind === "discover"
    ? { profiling: "setup", proposing: "routes", checking: "check", simulating: "physics", selecting: "physics",
      executing: "record", verifying: "record" }
    : { retrieving: "skill", profiling: "setup", checking: "check", proposing: "rank", simulating: "physics",
      selecting: "physics", executing: "record", verifying: "record" };
  if (kind === "transfer" && ev.status === "checking" && ev.data?.compatibility) return "setup";
  return by[ev.status] ?? null;
}

/** Stage states from the events so far: stages only move forward, so a later event never reopens an earlier one. */
export function stageStates(kind: RunKind, events: RunEvent[]): { key: StageKey; state: StageState }[] {
  const order = ORDER[kind];
  const reached = events.reduce((max, ev) => {
    const s = stageOf(kind, ev);
    return s ? Math.max(max, order.indexOf(s)) : max;
  }, -1);
  const final = events.at(-1)?.status;
  const finished = final === "succeeded" || final === "failed";
  return order.map((key, i) => {
    if (final === "succeeded") return { key, state: "done" };
    if (i < reached) return { key, state: "done" };
    if (i === reached || (reached === -1 && i === 0 && finished)) return { key, state: finished ? "failed" : "active" };
    return { key, state: finished ? "skipped" : "pending" };
  });
}
