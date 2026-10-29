import type { ExperienceCapsule, LibrarianMode, LibraryReport, ReasoningMode, RunEvent, RunRecord } from "./types";

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
    });
  } catch {
    throw new ApiError(0, `Backend unreachable at ${API_BASE}`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body?.detail === "string" ? body.detail : res.statusText;
    throw new ApiError(res.status, `${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function startMotionCheck(robotId: string, seed = 7): Promise<RunRecord> {
  return apiFetch<RunRecord>(`/api/robots/${robotId}/motion-check`, {
    method: "POST",
    body: JSON.stringify({ seed }),
  });
}

export function startDiscover(robotId: string, sceneSeed: number): Promise<RunRecord> {
  return apiFetch<RunRecord>("/api/runs/discover", {
    method: "POST",
    body: JSON.stringify({ robot_id: robotId, scene_seed: sceneSeed }),
  });
}

export function publishSkill(runId: string): Promise<ExperienceCapsule> {
  return apiFetch<ExperienceCapsule>("/api/skills", { method: "POST", body: JSON.stringify({ run_id: runId }) });
}

export function startTransfer(
  sourceSkillId: string, targetRobotId: string, sceneSeed: number | null, reasoningMode: ReasoningMode,
): Promise<RunRecord> {
  return apiFetch<RunRecord>("/api/transfers", {
    method: "POST",
    body: JSON.stringify({
      source_skill_id: sourceSkillId, target_robot_id: targetRobotId, scene_seed: sceneSeed, reasoning_mode: reasoningMode,
    }),
  });
}

/** Organize the published registry into a stored Library Report (never edits skills). */
export function createLibraryReport(provider: LibrarianMode): Promise<LibraryReport> {
  return apiFetch<LibraryReport>("/api/library/reports", { method: "POST", body: JSON.stringify({ provider }) });
}

/** Subscribe to a run's server-sent events. Returns an unsubscribe function. */
export function subscribeRun(
  runId: string,
  onEvent: (ev: RunEvent) => void,
  onDone: () => void,
): () => void {
  const source = new EventSource(apiUrl(`/api/runs/${runId}/events`));
  source.addEventListener("progress", (e) => onEvent(JSON.parse((e as MessageEvent).data)));
  source.addEventListener("done", () => {
    source.close();
    onDone();
  });
  source.onerror = () => {
    source.close();
    onDone();
  };
  return () => source.close();
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
