import type {
  BlogPost, BlogPostInput, DesignResult, ExecuteOn, ExperienceCapsule, LearningCheck, LibrarianMode, LibraryReport,
  ReasoningMode,
  PublicUser, RobotSummary, RunEvent, RunRecord, ScoutPlan, SharedKind, UploadResult, Visibility, VisibilityPlan,
} from "./types";

// "localhost", not 127.0.0.1: the pages run on localhost:3000, and browsers only send the sign-in cookie
// (SameSite=Lax) to an API on the same site; localhost and 127.0.0.1 count as different sites.
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  /** `detail` is the response's raw detail when it is structured (e.g. a visibility plan to confirm). */
  constructor(public readonly status: number, message: string, public readonly detail?: unknown) {
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
    throw new ApiError(res.status, `${res.status}: ${detail}`, body?.detail);
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

/** `publish`: save the verified skill with the run, so nothing waits on a separate save step. */
export function startDiscover(robotId: string, sceneSeed: number, taskFamily = "wall_reach_v1", publish = false): Promise<RunRecord> {
  return apiFetch<RunRecord>("/api/runs/discover", {
    method: "POST",
    body: JSON.stringify({ robot_id: robotId, scene_seed: sceneSeed, task_family: taskFamily, publish }),
  });
}

/** Before anything learns: does the robot know the task, does another robot, or nobody? (rules, no model call) */
export async function checkLearning(robotId: string, taskFamily: string, fromRobotId: string | null): Promise<LearningCheck> {
  try {
    return await apiFetch<LearningCheck>("/api/library/check", {
      method: "POST",
      body: JSON.stringify({ robot_id: robotId, task_family: taskFamily, from_robot_id: fromRobotId }),
    });
  } catch (e) {
    // FastAPI's bare "Not Found" means the route itself is missing: the backend predates the librarian check.
    if (e instanceof ApiError && e.message === "404: Not Found") throw new ApiError(404, OLD_BACKEND);
    throw e;
  }
}

const OLD_BACKEND = "The backend is older than this page and has no librarian check. Restart it to load the current code.";

/** Try another robot's skill on the layout of this robot's skill; the backend keeps it only if it is better. */
export function startImprove(skillId: string, sourceSkillId: string): Promise<RunRecord> {
  return apiFetch<RunRecord>(`/api/skills/${encodeURIComponent(skillId)}/improve`, {
    method: "POST", body: JSON.stringify({ source_skill_id: sourceSkillId }),
  });
}

/** Upload your own arm: the file itself is the request body (.xml, .urdf or .zip). */
/** Upload a robot. Several possible arms: 409 with `ApiError.detail.options`; repeat with one as `tool`, or with
 * `modelOnly` to keep it without an arm. */
export function uploadRobot(file: File, name: string, opts: { tool?: string; modelOnly?: boolean } = {}): Promise<UploadResult> {
  const q = new URLSearchParams({
    name, filename: file.name, ...(opts.tool ? { tool: opts.tool } : {}), ...(opts.modelOnly ? { mode: "model_only" } : {}),
  });
  return apiFetch<UploadResult>(`/api/robots/upload?${q}`, {
    method: "POST", body: file, headers: { "content-type": "application/octet-stream" },
  });
}

/** Which task type a goal is, and which saved skills `robotId` should learn from (Muse, or the offline scout). */
export async function scoutPlan(goal: string, robotId: string): Promise<ScoutPlan> {
  const plan = await apiFetch<Partial<ScoutPlan>>("/api/library/scout", { method: "POST", body: JSON.stringify({ goal, robot_id: robotId }) });
  // A backend older than the match fields answered with a single pick: read it as a match to confirm, with no alternatives.
  return { ...plan, match: plan.match ?? "unsure", alternatives: plan.alternatives ?? [], question: plan.question ?? null } as ScoutPlan;
}

/** Design a new task type from a description (Muse, or the offline designer) and add it to the task types. */
export function designTask(goal: string): Promise<DesignResult> {
  return apiFetch<DesignResult>("/api/tasks/design", { method: "POST", body: JSON.stringify({ goal }) });
}

/** Make your run, skill or uploaded robot public or private. Without `confirm`, a change that carries other items
 * along fails with 409 and the plan in `ApiError.detail` (see backend services/sharing.py). */
export function changeVisibility(kind: SharedKind, id: string, visibility: Visibility, confirm = false): Promise<VisibilityPlan> {
  return apiFetch<VisibilityPlan>("/api/visibility", { method: "POST", body: JSON.stringify({ kind, id, visibility, confirm }) });
}

export function publishSkill(runId: string): Promise<ExperienceCapsule> {
  return apiFetch<ExperienceCapsule>("/api/skills", { method: "POST", body: JSON.stringify({ run_id: runId }) });
}

export function startTransfer(
  sourceSkillId: string, targetRobotId: string, sceneSeed: number | null, reasoningMode: ReasoningMode,
  executeOn: ExecuteOn = "none", publish = false,
): Promise<RunRecord> {
  return apiFetch<RunRecord>("/api/transfers", {
    method: "POST",
    body: JSON.stringify({
      source_skill_id: sourceSkillId, target_robot_id: targetRobotId, scene_seed: sceneSeed, reasoning_mode: reasoningMode,
      execute_on: executeOn, publish,
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

/** Create an email + password account; the server signs you in (session cookie) on success. */
export function registerAccount(name: string, email: string, password: string): Promise<PublicUser> {
  return apiFetch<PublicUser>("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
}

export function signInWithPassword(email: string, password: string): Promise<PublicUser> {
  return apiFetch<PublicUser>("/api/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) });
}

/** Publish a blog post as the signed-in user (or as "Guest" when sign-in is off). */
export function createPost(post: BlogPostInput): Promise<BlogPost> {
  return apiFetch<BlogPost>("/api/blog", { method: "POST", body: JSON.stringify(post) });
}

/** Replace a post's title and text; only its author may. */
export function updatePost(postId: string, post: BlogPostInput): Promise<BlogPost> {
  return apiFetch<BlogPost>(`/api/blog/${encodeURIComponent(postId)}`, { method: "PUT", body: JSON.stringify(post) });
}

export function deletePost(postId: string): Promise<null> {
  return apiFetch<null>(`/api/blog/${encodeURIComponent(postId)}`, { method: "DELETE" });
}
