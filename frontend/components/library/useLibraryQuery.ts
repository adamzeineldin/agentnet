"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";
import { parseQuery, queryString, type LibraryQuery } from "./query";

export interface LibraryQueryState {
  query: LibraryQuery;
  /** Replace some values; the rest are kept. Only opening a page scrolls (to its top) and adds a history entry. */
  update: (patch: Partial<LibraryQuery>) => void;
}

/** Read and write the library's URL state. Callers sit under <Suspense> (useSearchParams). */
export function useLibraryQuery(): LibraryQueryState {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = useMemo(() => parseQuery(new URLSearchParams(params.toString())), [params]);
  // The last change asked for, until the router catches up: two quick changes (remove a token, then type) must both
  // stick, and router.replace lands a render later. Once the URL moves on (that change, or Back), it no longer applies.
  const pending = useRef<{ from: string; to: string } | null>(null);
  const update = useCallback((patch: Partial<LibraryQuery>) => {
    const now = params.toString();
    const base = pending.current?.from === now ? pending.current.to : now;
    const current = parseQuery(new URLSearchParams(base));
    const next = queryString({ ...current, ...patch });
    pending.current = { from: now, to: next.replace(/^\?/, "") };
    // Opening a skill or robot page is a step the browser's Back button should undo; filters and search are not.
    if (patch.open && patch.open !== current.open) router.push(`${pathname}${next}`);
    else router.replace(`${pathname}${next}`, { scroll: false });
  }, [router, pathname, params]);
  return { query, update };
}
