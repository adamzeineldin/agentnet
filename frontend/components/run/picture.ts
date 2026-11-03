import type {
  CandidateOutcome, CandidateSummary, Placement, ReasoningTrace, RouteClass, RunEvent, RunRecord, RunStatus,
  SearchMetrics, TaskSpec, Vec3,
} from "@/lib/types";

/** What one physics try produced (a full MuJoCo rollout of one route). */
export interface TryInfo {
  index: number;
  outcome: CandidateOutcome;
  reason: string;
  endpointErrorM: number | null;
  collisions: number;
  video?: string;
  thumbnail?: string;
  trace?: Vec3[];
}

export interface RouteRow {
  id: string;
  routeClass: RouteClass;
  clearanceM: number;
  waypoints: Vec3[];
  priorRank?: number | null;
  priorNote?: string | null;
  /** Kinematic check on this robot (joint geometry only, no physics). */
  check?: { possible: boolean; outcome: CandidateOutcome; reason: string };
  tried?: TryInfo;
}

export interface CompatCheck { check: string; status: "pass" | "warn" | "fail" | "info"; detail: string }

export interface SourceSkill {
  robotId: string;
  strategy: { route_class: RouteClass; clearance_m: number };
  task: TaskSpec;
  placement: Placement;
  trace: Vec3[];
}

/** Everything the run view draws, read from progress events while running and from the stored record after. */
export interface RunPicture {
  task?: TaskSpec;
  placement?: Placement;
  source?: SourceSkill;
  compatibility: CompatCheck[];
  routes: RouteRow[];
  ranking: string[];
  rankedBy?: string;
  selected?: string;
  lastStatus: RunStatus | null;
  finalChecks?: Record<string, boolean>;
}

const KINEMATIC_FAIL: ReadonlySet<CandidateOutcome> = new Set(["unreachable", "discontinuous_ik", "collision", "insufficient_clearance"]);

const routeFrom = (d: Record<string, unknown>): RouteRow => ({
  id: String(d.candidate_id),
  routeClass: d.route_class as RouteClass,
  clearanceM: Number(d.clearance_m),
  waypoints: (d.waypoints_task ?? []) as Vec3[],
  priorRank: (d.prior_rank as number | undefined) ?? null,
  priorNote: (d.prior_note as string | undefined) ?? null,
});

function tryFrom(d: Record<string, unknown>, index: number): TryInfo {
  return {
    index,
    outcome: d.outcome as CandidateOutcome,
    reason: String(d.reason ?? ""),
    endpointErrorM: (d.endpoint_error_m as number | null | undefined) ?? null,
    collisions: Number(d.collisions ?? 0),
    video: d.video as string | undefined,
    thumbnail: d.thumbnail as string | undefined,
    trace: d.trace_task as Vec3[] | undefined,
  };
}

const update = (rows: RouteRow[], id: string, change: Partial<RouteRow>): RouteRow[] =>
  rows.map((r) => (r.id === id ? { ...r, ...change } : r));

/** Fold progress events, in order, into a picture of the run so far. */
export function pictureFromEvents(events: RunEvent[]): RunPicture {
  return events.reduce<RunPicture>((pic, ev) => {
    const d = ev.data ?? {};
    const next: RunPicture = { ...pic, lastStatus: ev.status };
    if (d.task) Object.assign(next, { task: d.task as TaskSpec, placement: d.placement as Placement });
    if (d.strategy && d.source_task) {
      next.source = {
        robotId: String(d.source_robot_id), strategy: d.strategy as SourceSkill["strategy"],
        task: d.source_task as TaskSpec, placement: d.source_placement as Placement, trace: (d.source_trace ?? []) as Vec3[],
      };
    }
    if (d.compatibility) next.compatibility = d.compatibility as CompatCheck[];
    if (Array.isArray(d.routes)) next.routes = (d.routes as Record<string, unknown>[]).map(routeFrom);
    if (ev.status === "checking" && d.candidate_id && d.outcome) {
      const outcome = d.outcome as CandidateOutcome;
      next.routes = update(next.routes, String(d.candidate_id),
        { check: { possible: !KINEMATIC_FAIL.has(outcome), outcome, reason: String(d.reason ?? ev.message) } });
    }
    if (ev.status === "proposing" && Array.isArray(d.ranking)) {
      next.ranking = d.ranking as string[];
      next.rankedBy = (d.provider as string | undefined) ?? next.rankedBy;
    }
    if (ev.status === "simulating" && d.candidate_id && d.future_index != null) {
      next.routes = update(next.routes, String(d.candidate_id), { tried: tryFrom(d, Number(d.future_index)) });
    }
    if (ev.status === "selecting" && d.candidate_id) next.selected = String(d.candidate_id);
    return next;
  }, { compatibility: [], routes: [], ranking: [], lastStatus: null });
}

function rowFromSummary(c: CandidateSummary, simulatedOrder: string[]): RouteRow {
  const possible = !KINEMATIC_FAIL.has(c.outcome);
  const index = c.physics?.future_index ?? simulatedOrder.indexOf(c.candidate_id) + 1;
  return {
    id: c.candidate_id, routeClass: c.route_class, clearanceM: c.clearance_m, waypoints: c.waypoints_task,
    priorRank: c.prior_rank, priorNote: c.prior_note,
    check: { possible, outcome: possible ? "feasible" : c.outcome, reason: c.reason },
    tried: c.physics ? {
      index, outcome: c.outcome, reason: c.reason, endpointErrorM: c.physics.endpoint_error_m,
      collisions: c.physics.collisions.length, video: c.physics.video, thumbnail: c.physics.thumbnail,
      trace: c.physics.trace_task,
    } : undefined,
  };
}

/** A finished run: the stored candidates are the authority (older runs have sparser events). */
export function pictureFromRun(run: RunRecord): RunPicture {
  const fromEvents = pictureFromEvents(run.events);
  const candidates = (run.results.candidates ?? []) as CandidateSummary[];
  const metrics = run.results.search_metrics as SearchMetrics | undefined;
  const trace = run.results.reasoning as ReasoningTrace | undefined;
  const routes = candidates.length ? candidates.map((c) => rowFromSummary(c, metrics?.simulated_order ?? [])) : fromEvents.routes;
  return {
    ...fromEvents,
    task: (run.results.task as TaskSpec | undefined) ?? fromEvents.task,
    placement: (run.results.placement as Placement | undefined) ?? fromEvents.placement,
    compatibility: (run.results.compatibility as CompatCheck[] | undefined) ?? fromEvents.compatibility,
    routes: [...routes].sort((a, b) => (a.priorRank ?? 0) - (b.priorRank ?? 0)),
    ranking: trace?.final_order?.length ? trace.final_order : fromEvents.ranking,
    rankedBy: trace?.provider_used ?? fromEvents.rankedBy,
    selected: (run.results.selected as string | undefined) ?? fromEvents.selected,
    finalChecks: run.results.checks as Record<string, boolean> | undefined,
  };
}

export const triesOf = (pic: RunPicture): (RouteRow & { tried: TryInfo })[] =>
  pic.routes.filter((r): r is RouteRow & { tried: TryInfo } => !!r.tried).sort((a, b) => a.tried.index - b.tried.index);
