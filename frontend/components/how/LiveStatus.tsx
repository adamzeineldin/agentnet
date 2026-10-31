"use client";

import { useApi } from "@/lib/useApi";
import type { ControllerStatusInfo, Health, RealDatasetSummary } from "@/lib/types";
import { Badge, Panel } from "../ui";

type Tone = "good" | "warn" | "bad" | "neutral";

/** Short, plain wording for URSim's state; the raw detail stays available as a tooltip. */
function ursimText(s: ControllerStatusInfo): string {
  if (s.ready) return `ready · PolyScope ${s.controller_version}`;
  if (!s.configured) return "not configured on this server";
  return s.reachable ? "starting up (about 2 minutes)" : "offline right now";
}

/** What is switched on for this particular server, read live from the API. */
export function LiveStatus() {
  const health = useApi<Health>("/api/health");
  const ursim = useApi<ControllerStatusInfo>("/api/controller/status");
  const real = useApi<RealDatasetSummary[]>("/api/real-data");
  const episodes = real.data?.reduce((n, d) => n + d.episodes.length, 0);
  const rows: [string, string, Tone, string?][] = [
    ["Physics simulator", health.data ? `MuJoCo ${health.data.versions.mujoco}` : health.error ? "unreachable" : "…",
      health.data ? "good" : health.error ? "bad" : "neutral"],
    ["Route ranking", health.data?.reasoning.label ?? "…", health.data ? "good" : "neutral"],
    ["Real robot recordings", episodes != null ? `${episodes} DROID episodes imported` : "…", episodes ? "good" : "neutral"],
    ["URSim controller", ursim.data ? ursimText(ursim.data) : "…", ursim.data?.ready ? "good" : "warn", ursim.data?.detail],
  ];
  return (
    <Panel title="What this server has switched on">
      <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([k, v, tone, detail]) => (
          <div key={k}><dt className="text-ink-3">{k}</dt><dd className="mt-1"><Badge tone={tone} title={detail}>{v}</Badge></dd></div>
        ))}
      </dl>
    </Panel>
  );
}
