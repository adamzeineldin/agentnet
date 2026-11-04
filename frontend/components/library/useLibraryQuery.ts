"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { parseQuery, queryString, type LibraryQuery } from "./query";

export interface LibraryQueryState {
  query: LibraryQuery;
  /** Replace some values; the rest are kept. The page does not scroll. */
  update: (patch: Partial<LibraryQuery>) => void;
}

/** Read and write the library's URL state. Callers sit under <Suspense> (useSearchParams). */
export function useLibraryQuery(): LibraryQueryState {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = useMemo(() => parseQuery(new URLSearchParams(params.toString())), [params]);
  const update = useCallback(
    (patch: Partial<LibraryQuery>) => router.replace(`${pathname}${queryString({ ...query, ...patch })}`, { scroll: false }),
    [router, pathname, query],
  );
  return { query, update };
}
