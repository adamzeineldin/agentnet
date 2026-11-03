import type { BadgeTone } from "../ui";

/** Route outcomes in plain words, shared by the run view and the run story. */
export const OUTCOME: Record<string, { text: string; tone: BadgeTone }> = {
  verified: { text: "passed the physics test", tone: "good" },
  physics_failure: { text: "failed the physics test", tone: "bad" },
  feasible: { text: "possible, not needed", tone: "neutral" },
  not_simulated: { text: "possible, not needed", tone: "neutral" },
  collision: { text: "would hit something", tone: "bad" },
  insufficient_clearance: { text: "too close to the wall", tone: "bad" },
  unreachable: { text: "arm can't reach it", tone: "bad" },
  discontinuous_ik: { text: "arm would have to jump", tone: "bad" },
};

export const outcomeText = (o: string) => OUTCOME[o] ?? { text: o.replaceAll("_", " "), tone: "neutral" as const };

/** Why a physics try failed, from its stored checks ("Physics rollout failed: no_collisions, settled"). */
export function failedChecks(reason: string): string {
  const PLAIN: Record<string, string> = {
    endpoint_within_tolerance: "hand ended more than 1 cm from the target",
    no_collisions: "touched something",
    no_limit_violations: "a joint went past its limit",
    settled: "arm didn't come to rest",
    reproduces_rollout: "the recording didn't match the earlier try",
    follows_recorded_path: "drifted from the recorded path",
  };
  const list = reason.split(":")[1] ?? "";
  const named = list.split(",").map((s) => s.trim()).filter(Boolean).map((k) => PLAIN[k] ?? k.replaceAll("_", " "));
  return named.join(", ");
}

export const CHECK_TEXT: Record<string, string> = {
  endpoint_within_tolerance: "Hand ends within 1 cm of the target",
  no_collisions: "Touches nothing",
  no_limit_violations: "No joint goes past its limit",
  settled: "Arm comes to rest",
  reproduces_rollout: "Same result as the earlier try",
  follows_recorded_path: "Follows the recorded path",
};

/** The offline prior's note (services/transfer.py prior_order) in plain words. */
export function plainNote(note: string, teacher: string): string {
  if (note.startsWith("capsule strategy")) return `Exactly the route that worked for the ${teacher}`;
  if (note.startsWith("same route class")) return `Same kind of route as the ${teacher}'s, at a different distance from the wall`;
  if (note.startsWith("alternative verified")) return `Another route that also worked for the ${teacher}`;
  if (note.startsWith("kinematically feasible")) return `Was possible for the ${teacher}, but never tested`;
  if (note.startsWith("source: ")) return `Didn't work for the ${teacher} (${note.slice(8)})`;
  return note;
}
