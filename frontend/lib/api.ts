import type { RunEvent, RunRecord } from "./types";

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
