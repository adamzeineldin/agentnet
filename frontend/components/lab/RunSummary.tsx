import type { RunRecord, SkillMetrics } from "@/lib/types";
import { CHECK_TEXT, failedChecks } from "../run/outcomes";
import { triesOf, type RunPicture } from "../run/picture";
import { title, type StepNames } from "../run/RunSteps";
import type { RunKind, StageKey, StageState } from "../run/stages";
import { routePhrase } from "../transfer/describe";
import { Badge } from "../ui";
import { Comparison, Metrics } from "./Metrics";

/** Two verified motions to set side by side: the teacher's and the learner's, or the old skill and the new attempt. */
export interface Compared { left: SkillMetrics; right: SkillMetrics; labels: [string, string] }

interface RunSummaryProps {
  kind: RunKind;
  busy: boolean;
  run: RunRecord | null;
  pic: RunPicture;
  stages: { key: StageKey; state: StageState }[];
  names: StepNames;
  /** The skill this run saved (or replayed), measured from its stored capsule. */
  saved: SkillMetrics | null;
  compare: Compared | null;
}

/** One number per stage, so progress reads at a glance; the full story stays in "How it was found". */
function stageNote(key: StageKey, pic: RunPicture): string {
  const tries = triesOf(pic);
  const checked = pic.routes.filter((r) => r.check);
  const checks = Object.values(pic.finalChecks ?? {});
  switch (key) {
    case "routes": return pic.routes.length ? `${pic.routes.length} routes` : "";
    case "check": return checked.length ? `${checked.filter((r) => r.check?.possible).length} of ${checked.length} possible` : "";
    case "rank": return pic.rankedBy ? (pic.rankedBy.includes("meta") ? "by Muse Spark" : "by a fixed rule") : "";
    case "physics": return tries.length ? `${tries.filter((t) => t.tried.outcome === "verified").length} of ${tries.length} passed` : "";
    case "record": return checks.length ? `${checks.filter(Boolean).length} of ${checks.length} checks` : "";
    default: return "";
  }
}

const DOT: Record<StageState, string> = {
  done: "bg-good", active: "animate-pulse bg-accent", failed: "bg-bad", pending: "bg-line-strong", skipped: "bg-line-strong",
};

function Progress({ kind, pic, stages, names }: Pick<RunSummaryProps, "kind" | "pic" | "stages" | "names">) {
  return (
    <ol aria-label="Progress" className="space-y-2.5">
      {stages.map(({ key, state }) => (
        <li key={key} aria-current={state === "active" ? "step" : undefined}
          className={`flex items-center gap-3 text-sm ${state === "pending" || state === "skipped" ? "text-ink-3" : "text-ink"}`}>
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[state]}`} />
          <span className="min-w-0 flex-1 truncate">{title(key, kind, names, pic).replace(/:.*/, "")}</span>
          <span className="tabular shrink-0 text-xs text-ink-3">{stageNote(key, pic)}</span>
        </li>
      ))}
    </ol>
  );
}

function Checks({ checks }: { checks: Record<string, boolean> }) {
  return (
    <ul aria-label="Final checks" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {Object.entries(checks).map(([k, ok]) => (
        <li key={k} className={ok ? "text-good" : "text-bad"}>{ok ? "✓" : "✕"} {CHECK_TEXT[k] ?? k.replaceAll("_", " ")}</li>
      ))}
    </ul>
  );
}

/** Why nothing was saved: each physics try and what it failed, in plain words. */
function Failures({ pic }: { pic: RunPicture }) {
  const tries = triesOf(pic);
  if (!tries.length) return <p className="text-sm text-ink-2">No route got as far as the physics test.</p>;
  return (
    <ul className="space-y-1 text-sm text-ink-2">
      {tries.map((t) => (
        <li key={t.id}>Try {t.tried.index} · {routePhrase(t.id)}: <span className="text-bad">{failedChecks(t.tried.reason) || "failed"}</span></li>
      ))}
    </ul>
  );
}

/**
 * Beside the simulation: while it runs, the stages with one number each; once done, what came out of it, measured
 * from the stored run and compared with the skill it came from.
 */
export function RunSummary({ kind, busy, run, pic, stages, names, saved, compare }: RunSummaryProps) {
  const finished = run !== null && !busy;
  const ok = finished && run.status === "succeeded";
  return (
    <div className="flex h-full min-w-0 flex-col gap-4 rounded-xl border border-line bg-panel p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-3">{finished ? "Result" : "Progress"}</p>
        {ok && <Badge tone="good">simulation-verified</Badge>}
        {finished && !ok && <Badge tone="bad">not verified · nothing saved</Badge>}
      </div>
      {!finished && <Progress kind={kind} pic={pic} stages={stages} names={names} />}
      {ok && compare && <Comparison existing={compare.left} candidate={compare.right} labels={compare.labels} />}
      {ok && !compare && saved && <Metrics m={saved} />}
      {ok && pic.finalChecks && <Checks checks={pic.finalChecks} />}
      {finished && !ok && <Failures pic={pic} />}
    </div>
  );
}
