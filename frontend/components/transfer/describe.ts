import { fmtM } from "@/lib/format";
import type { RunRecord } from "@/lib/types";
import { routeName } from "./skillName";

/** "over@0.08" → "over the top, 8 cm clear". */
export function routePhrase(candidateId: string | null | undefined): string {
  if (!candidateId) return "no route";
  const [route, clearance] = candidateId.split("@");
  const cm = Math.round(Number(clearance) * 100);
  return `${routeName(route).toLowerCase()}${cm ? `, ${cm} cm clear` : ""}`;
}

function accuracy(run: RunRecord): string {
  const touches = run.collision_count ?? 0;
  return `Its hand ended ${fmtM(run.endpoint_error_m, 1)} from the target` +
    (touches === 0 ? " without touching anything." : `, touching an obstacle ${touches} time${touches === 1 ? "" : "s"}.`);
}

/** One sentence for a finished discover run, built from the stored record only. */
export function describeDiscover(run: RunRecord, robot: string): string {
  if (run.status !== "succeeded") return `The ${robot} couldn't find a route that passes the physics test (${run.error ?? "failed"}).`;
  return `The ${robot} found a way: ${routePhrase(run.results.selected as string)}. ${accuracy(run)}`;
}

/** One sentence for a finished transfer run, built from the stored record only. */
export function describeTransfer(run: RunRecord, teacher: string, learner: string): string {
  if (run.status !== "succeeded") return `The ${learner} couldn't do it: ${run.error ?? "no route passed the physics test"}.`;
  const adaptation = run.results.adaptation as { source_strategy: string; strategy_preserved: boolean } | undefined;
  const chosen = routePhrase(run.results.selected as string);
  const lead = adaptation?.strategy_preserved
    ? `The ${learner} used the ${teacher}'s idea (${chosen}) with its own joint motion.`
    : `The ${teacher}'s route (${routePhrase(adaptation?.source_strategy)}) didn't work for the ${learner}, so it went ${chosen} instead.`;
  return `${lead} ${accuracy(run)}`;
}
