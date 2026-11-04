"use client";

import type { ReactNode } from "react";
import { apiUrl } from "@/lib/api";
import { fmtM, fmtMetres } from "@/lib/format";
import { routePhrase } from "../transfer/describe";
import { routeName } from "../transfer/skillName";
import { Badge } from "../ui";
import { CHECK_TEXT, failedChecks, outcomeText, plainNote } from "./outcomes";
import { triesOf, type RouteRow, type RunPicture, type TryInfo } from "./picture";
import type { RunKind, StageKey, StageState } from "./stages";

export interface StepNames { robot: string; teacher?: string; robotDof?: number; teacherDof?: number }

interface RunStepsProps {
  kind: RunKind;
  stages: { key: StageKey; state: StageState }[];
  pic: RunPicture;
  names: StepNames;
  watching: string | null;
  onWatch: (row: RouteRow & { tried: TryInfo }) => void;
}

const ICON: Record<StageState, { mark: string; className: string; label: string }> = {
  done: { mark: "✓", className: "bg-good/15 text-good", label: "done" },
  active: { mark: "", className: "bg-accent/15 text-accent", label: "in progress" },
  failed: { mark: "✕", className: "bg-bad/15 text-bad", label: "stopped here" },
  pending: { mark: "", className: "bg-panel-2 text-ink-3", label: "not started" },
  skipped: { mark: "–", className: "bg-panel-2 text-ink-3", label: "not reached" },
};

const shortRoute = (r: RouteRow) => `${routeName(r.routeClass).replace("Around the ", "").replace(" the top", "")}${r.clearanceM ? ` ${Math.round(r.clearanceM * 100)} cm` : ""}`;

function CheckChips({ routes }: { routes: RouteRow[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Route checks">
      {routes.map((r) => (
        <li key={r.id} title={r.check ? `${routePhrase(r.id)}: ${r.check.reason}` : `${routePhrase(r.id)}: not checked yet`}
          className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${!r.check ? "border-line text-ink-3" : r.check.possible ? "border-good/40 text-good" : "border-bad/40 text-bad line-through decoration-bad/40"}`}>
          {r.check ? (r.check.possible ? "✓ " : "✕ ") : "○ "}{shortRoute(r)}
        </li>
      ))}
    </ul>
  );
}

function CheckSummary({ routes }: { routes: RouteRow[] }) {
  const checked = routes.filter((r) => r.check);
  const possible = checked.filter((r) => r.check!.possible).length;
  const reasons = [...new Set(checked.filter((r) => !r.check!.possible).map((r) => outcomeText(r.check!.outcome).text))];
  return (
    <p className="text-xs text-ink-3">
      {checked.length} of {routes.length} checked · <span className="text-good">{possible} possible</span>
      {checked.length - possible > 0 && <> · <span className="text-bad">{checked.length - possible} ruled out</span> ({reasons.join(", ")})</>}
    </p>
  );
}

function Tries({ pic, watching, onWatch }: Pick<RunStepsProps, "pic" | "watching" | "onWatch">) {
  const tries = triesOf(pic);
  if (tries.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Physics tries">
      {tries.map((r) => {
        const o = outcomeText(r.tried.outcome);
        const why = r.tried.outcome === "physics_failure" ? failedChecks(r.tried.reason) : "";
        const on = watching === r.id;
        return (
          <li key={r.id}>
            <button onClick={() => onWatch(r)} disabled={!r.tried.video} aria-pressed={on}
              aria-label={`Watch physics try ${r.tried.index}: ${routePhrase(r.id)}`}
              className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors disabled:cursor-default ${on ? "border-accent bg-accent/5" : "border-line hover:border-line-strong hover:bg-panel-2"}`}>
              {r.tried.thumbnail
                /* eslint-disable-next-line @next/next/no-img-element -- final frame of this MuJoCo try */
                ? <img src={apiUrl(r.tried.thumbnail)} alt="" className="aspect-video w-24 shrink-0 rounded-md object-cover" />
                : <span className="grid aspect-video w-24 shrink-0 place-items-center rounded-md bg-panel-2 text-[10px] text-ink-3">no clip</span>}
              <span className="min-w-0 flex-1 text-sm">
                <span className="block">Try {r.tried.index}: {routePhrase(r.id)}</span>
                <span className={`block text-xs ${o.tone === "good" ? "text-good" : "text-bad"}`}>
                  {o.text}{why && ` · ${why}`}{r.tried.endpointErrorM != null && ` · ${fmtM(r.tried.endpointErrorM, 1)} from target`}
                </span>
              </span>
              {r.tried.video && <span className="shrink-0 text-xs text-accent">{on ? "watching" : "▶ watch"}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Short facts as chips, so a stage reads at a glance instead of as a paragraph. */
function Chips({ items }: { items: (ReactNode | false | null | undefined)[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.filter(Boolean).map((item, i) => <li key={i} className="rounded-full bg-panel-2 px-2.5 py-0.5 text-[11px] text-ink-2">{item}</li>)}
    </ul>
  );
}

/** Plain detail for each stage, from what the run has reported so far. */
function detail(key: StageKey, props: RunStepsProps): ReactNode {
  const { pic, names, kind } = props;
  const { robot, teacher } = names;
  const reach = pic.compatibility.find((c) => c.check === "strategy_within_reach");
  const reachPct = reach?.detail.match(/(\d+)% of target/)?.[1];
  switch (key) {
    case "skill":
      return pic.source && (
        <Chips items={[
          <>route: <b>{routePhrase(`${pic.source.strategy.route_class}@${pic.source.strategy.clearance_m.toFixed(2)}`)}</b></>,
          `layout ${pic.source.task.seed}`,
          <span key="angles" title="The skill holds the task's shape and the route, never joint angles.">no joint angles</span>,
        ]} />
      );
    case "setup":
      return pic.task && pic.placement && (
        <div className="space-y-2">
          {kind === "discover" && <p className="text-ink-3">Layout {pic.task.seed}: {pic.task.description}</p>}
          <Chips items={[
            `${fmtMetres(pic.placement.translation[0])} in front of the ${robot}`,
            pic.source && teacher && `${teacher}: ${fmtMetres(pic.source.placement.translation[0])}`,
            reachPct && `route uses ${reachPct}% of its reach`,
            kind === "transfer" && names.teacherDof && names.robotDof && (names.teacherDof !== names.robotDof
              ? `The ${teacher} has ${names.teacherDof} joints and the ${robot} has ${names.robotDof}: angles can't be copied`
              : `both ${names.robotDof} joints, different links: copied angles would miss`),
          ]} />
        </div>
      );
    case "routes":
      return pic.routes.length > 0 && <Chips items={[`${pic.routes.length} routes`, "straight", "over the top", "around either side"]} />;
    case "check":
      return pic.routes.length > 0 && (
        <div className="space-y-2" title={`Geometry only, no physics yet: can the ${robot}'s own joints follow each route without hitting anything?`}>
          <CheckSummary routes={pic.routes} />
          <CheckChips routes={pic.routes} />
        </div>
      );
    case "rank": {
      const byId = new Map(pic.routes.map((r) => [r.id, r]));
      const top = pic.ranking.map((id) => byId.get(id)).filter((r): r is RouteRow => !!r?.check?.possible).slice(0, 3);
      const muse = pic.rankedBy === "meta_muse_spark";
      return top.length > 0 && (
        <div className="space-y-2">
          <Badge tone={muse ? "accent" : "neutral"}>{muse ? "ordered by Meta Muse Spark" : "ordered by a fixed rule (no AI)"}</Badge>
          <ol className="space-y-1">
            {top.map((r, i) => (
              <li key={r.id} className="text-xs"><span className="font-mono text-ink-3">{i + 1}.</span> {routePhrase(r.id)}
                {r.priorNote && <span className="text-ink-3"> · {plainNote(r.priorNote, teacher ?? "teacher")}</span>}</li>
            ))}
          </ol>
        </div>
      );
    }
    case "physics":
      return <Tries pic={pic} watching={props.watching} onWatch={props.onWatch} />;
    case "record":
      return pic.finalChecks && (
        <ul className="flex flex-wrap gap-1.5 text-[11px]">
          {Object.entries(pic.finalChecks).map(([k, ok]) => (
            <li key={k} className={`rounded-full border px-2 py-0.5 ${ok ? "border-good/40 text-good" : "border-bad/40 text-bad"}`}>
              {ok ? "✓" : "✕"} {CHECK_TEXT[k] ?? k.replaceAll("_", " ")}</li>
          ))}
        </ul>
      );
  }
}

export function title(key: StageKey, kind: RunKind, { robot, teacher }: StepNames, pic: RunPicture): string {
  switch (key) {
    case "skill": return `Read the ${teacher}'s saved skill`;
    case "setup": return kind === "discover" ? "Set up the task" : `Set the task down in front of the ${robot}`;
    case "routes": return "Sketch routes to the target";
    case "check": return kind === "discover" ? `Check each route against the ${robot}'s joints` : `Work out the ${robot}'s own joint motion`;
    case "rank": return `Order routes by what worked for the ${teacher}`;
    case "physics": return `Test the best routes in physics${pic.selected ? `: ${routePhrase(pic.selected)} chosen` : ""}`;
    case "record": return "Record the winner and check it again";
  }
}

/** The run's stages, filled in live as progress events arrive; stays as the record of what happened. */
export function RunSteps(props: RunStepsProps) {
  const { kind, stages, names, pic } = props;
  return (
    <ol className="space-y-1" aria-label="What the simulator is doing">
      {stages.map(({ key, state }, i) => {
        const icon = ICON[state];
        const open = state === "done" || state === "active" || state === "failed";
        return (
          <li key={key} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center">
              <span aria-label={icon.label} className={`grid size-7 place-items-center rounded-full font-mono text-xs ${icon.className}`}>
                {state === "active" ? <span className="size-2 animate-pulse rounded-full bg-accent" /> : icon.mark || i + 1}
              </span>
              {i < stages.length - 1 && <span aria-hidden="true" className="w-px flex-1 bg-line" />}
            </div>
            <div className={`min-w-0 pb-4 ${open ? "" : "opacity-55"}`}>
              <p className={`pt-1 text-sm ${state === "active" ? "font-medium text-ink" : "text-ink"}`}>
                {title(key, kind, names, pic)}
                {state === "failed" && <span className="ml-2"><Badge tone="bad">stopped here</Badge></span>}
                {state === "skipped" && <span className="ml-2 text-xs text-ink-3">not reached</span>}
              </p>
              {open && <div className="mt-1 space-y-2 text-xs text-ink-2 [&_p]:max-w-prose">{detail(key, props)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
