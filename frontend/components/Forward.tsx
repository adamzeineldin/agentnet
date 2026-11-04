"use client";

import { useEffect } from "react";
import { Loading } from "./ui";

interface ForwardProps {
  /** Where the page moved to. */
  to: string;
  /** Query values to add, such as the Library view the old page became. */
  set?: Record<string, string>;
  /** Query keys the new page calls something else, old name → new name. */
  rename?: Record<string, string>;
}

/**
 * Old pages (Robots, Teach, Skills, All runs, Real data, Results) moved into the Lab and the Library. Their links
 * keep working: this forwards on the client, keeping the query, because the static cloud export has no server redirects.
 */
export function Forward({ to, set = {}, rename = {} }: ForwardProps) {
  const key = JSON.stringify(set);
  const renames = JSON.stringify(rename);
  useEffect(() => {
    const old = new URLSearchParams(window.location.search);
    const names = JSON.parse(renames) as Record<string, string>;
    const params = new URLSearchParams([...old].map(([k, v]) => [names[k] ?? k, v]));
    for (const [k, v] of Object.entries(JSON.parse(key) as Record<string, string>)) params.set(k, v);
    const q = params.toString();
    window.location.replace(`${to}${q ? `?${q}` : ""}${window.location.hash}`);
  }, [to, key, renames]);
  return <Loading label="Opening…" />;
}
