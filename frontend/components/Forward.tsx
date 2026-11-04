"use client";

import { useEffect } from "react";
import { Loading } from "./ui";

interface ForwardProps {
  /** Where the page moved to. */
  to: string;
  /** Query values to add, such as the Library view the old page became. */
  set?: Record<string, string>;
}

/**
 * Old pages (Robots, Teach, Skills, All runs, Real data, Results) moved into the Lab and the Library. Their links
 * keep working: this forwards on the client, keeping the query, because the static cloud export has no server redirects.
 */
export function Forward({ to, set = {} }: ForwardProps) {
  const key = JSON.stringify(set);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(JSON.parse(key) as Record<string, string>)) params.set(k, v);
    const q = params.toString();
    window.location.replace(`${to}${q ? `?${q}` : ""}${window.location.hash}`);
  }, [to, key]);
  return <Loading label="Opening…" />;
}
