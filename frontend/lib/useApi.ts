"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Fetch a backend path on mount (and every refreshMs if given). */
export function useApi<T>(path: string | null, refreshMs?: number): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    apiFetch<T>(path)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(reload, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, reload]);

  return { data, error, loading, reload };
}
