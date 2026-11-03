import type {
  ExecuteOn, ExperienceCapsule, LibrarianMode, LibraryReport, ReasoningMode, RobotSummary, RunEvent, RunRecord,
  ScoutPlan, UploadResult,
} from "./types";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, `Backend unreachable at ${API_BASE}`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body?.detail === "string" ? body.detail
      : Array.isArray(body?.detail) ? body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ") || res.statusText
      : res.statusText;
    throw new ApiError(res.status, `${res.status}: ${detail}`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

/** Add a catalog arm to the fleet (its passport is computed from the model first). */
export function enableRobot(robotId: string): Promise<RobotSummary> {
  return apiFetch<RobotSummary>(`/api/robots/${robotId}/enable`, { method: "POST" });
}

export function startMotionCheck(robotId: string, seed = 7): Promise<RunRecord> {
  return apiFetch<RunRecord>(`/api/robots/${robotId}/motion-check`, {
    method: "POST",
    body: JSON.stringify({ seed }),
  });
}

export function startDiscover(robotId: string, sceneSeed: number, taskFamily = "wall_reach_v1"): Promise<RunRecord> {
  return apiFetch<RunRecord>("/api/runs/discover", {
    method: "POST",
    body: JSON.stringify({ robot_id: robotId, scene_seed: sceneSeed, task_family: taskFamily }),
  });
}

/** Upload your own arm: the file itself is the request body (.xml, .urdf or .zip). */
export function uploadRobot(file: File, name: string, tool?: string): Promise<UploadResult> {
  const q = new URLSearchParams({ name, filename: file.name, ...(tool ? { tool } : {}) });
  return apiFetch<UploadResult>(`/api/robots/upload?${q}`, {
    method: "POST", body: file, headers: { "content-type": "application/octet-stream" },
  });
}

/** Which task type a goal is, and which saved skills `robotId` should learn from (Muse, or the offline scout). */
export function scoutPlan(goal: string, robotId: string): Promise<ScoutPlan> {
  return apiFetch<ScoutPlan>("/api/library/scout", { method: "POST", body: JSON.stringify({ goal, robot_id: robotId }) });
}

export function publishSkill(runId: string): Promise<ExperienceCapsule> {
  return apiFetch<ExperienceCapsule>("/api/skills", { method: "POST", body: JSON.stringify({ run_id: runId }) });
}

export function startTransfer(
  sourceSkillId: string, targetRobotId: string, sceneSeed: number | null, reasoningMode: ReasoningMode,
  executeOn: ExecuteOn = "none",
): Promise<RunRecord> {
  return apiFetch<RunRecord>("/api/transfers", {
    method: "POST",
    body: JSON.stringify({
      source_skill_id: sourceSkillId, target_robot_id: targetRobotId, scene_seed: sceneSeed, reasoning_mode: reasoningMode,
      execute_on: executeOn,
    }),
  });
}

/** Replay a recorded real-robot episode in MuJoCo on `robotId` (optionally also on URSim). */
export function startRealReplay(
  datasetId: string, episodeIndex: number, robotId: string, executeOn: ExecuteOn = "none",
): Promise<RunRecord> {
  return apiFetch<RunRecord>("/api/real-data/replays", {
    method: "POST",
    body: JSON.stringify({ dataset_id: datasetId, episode_index: episodeIndex, robot_id: robotId, execute_on: executeOn }),
  });
}

/** Organize the published registry into a stored Library Report (never edits skills). */
export function createLibraryReport(provider: LibrarianMode): Promise<LibraryReport> {
  return apiFetch<LibraryReport>("/api/library/reports", { method: "POST", body: JSON.stringify({ provider }) });
}

const TERMINAL = new Set(["succeeded", "failed"]);
const POLL_MS = 2000;

/** Subscribe to a run's server-sent events. Returns an unsubscribe function.
 *
 * If the stream drops before the run finishes (a proxy timeout, a flaky network), it falls back to polling the run
 * record and replays any events it has not delivered yet, so a long run is never reported as unreachable. */
export function subscribeRun(
  runId: string,
  onEvent: (ev: RunEvent) => void,
  onDone: () => void,
): () => void {
  let delivered = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const source = new EventSource(apiUrl(`/api/runs/${runId}/events`));
  const finish = () => {
    if (stopped) return;
    stopped = true;
    source.close();
    onDone();
  };
  const poll = async () => {
    if (stopped) return;
    try {
      const run = await apiFetch<RunRecord>(`/api/runs/${runId}`);
      run.events.slice(delivered).forEach(onEvent);
      delivered = run.events.length;
      if (TERMINAL.has(run.status)) return finish();
    } catch {
      // Keep trying: the run keeps going on the server even while this browser cannot reach it.
    }
    timer = setTimeout(() => void poll(), POLL_MS);
  };
  source.addEventListener("progress", (e) => {
    delivered += 1;
    onEvent(JSON.parse((e as MessageEvent).data));
  });
  source.addEventListener("done", finish);
  source.onerror = () => {
    source.close();
    if (!stopped && timer === null) void poll();
  };
  return () => {
    stopped = true;
    source.close();
    if (timer) clearTimeout(timer);
  };
}

/** Start a run and resolve with its final record once the SSE stream reports completion. */
export function runToCompletion(
  starter: () => Promise<RunRecord>,
  onEvent: (ev: RunEvent) => void,
): { done: Promise<RunRecord>; cancel: () => void } {
  let cancel = () => {};
  const done = starter().then(
    (queued) =>
      new Promise<RunRecord>((resolve, reject) => {
        cancel = subscribeRun(queued.run_id, onEvent, () => {
          apiFetch<RunRecord>(`/api/runs/${queued.run_id}`).then(resolve, reject);
        });
      }),
  );
  return { done, cancel: () => cancel() };
}
