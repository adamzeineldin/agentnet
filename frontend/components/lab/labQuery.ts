"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/** The Lab's URL state: one robot, one task type, and optionally the robot the user asked to learn from. */
export interface LabQuery {
  robot: string | null;
  task: string | null;
  from: string | null;
}

/** Older links used ?source= (the teacher) and ?target= (the learner); they still open the right robot. */
export function parseLabQuery(params: URLSearchParams): LabQuery {
  const target = params.get("target");
  return {
    robot: params.get("robot") ?? target ?? params.get("source"),
    task: params.get("task"),
    from: params.get("from") ?? (target ? params.get("source") : null),
  };
}

export function labHref(q: Partial<LabQuery>): string {
  const params = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1]));
  const s = params.toString();
  return s ? `/lab?${s}` : "/lab";
}

/** Read and write the Lab's URL state. Callers sit under <Suspense> (useSearchParams). */
export function useLabQuery(): { query: LabQuery; update: (patch: Partial<LabQuery>) => void } {
  const params = useSearchParams();
  const router = useRouter();
  const query = useMemo(() => parseLabQuery(new URLSearchParams(params.toString())), [params]);
  const update = useCallback((patch: Partial<LabQuery>) => {
    router.replace(labHref({ ...query, ...patch }), { scroll: false });
  }, [router, query]);
  return { query, update };
}
