"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { fmtM, shortHash } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { RobotPassport, RobotSummary } from "@/lib/types";
import { CapabilityComparison } from "./CapabilityComparison";
import { PassportView } from "./PassportView";
import { ErrorNote, Loading } from "./ui";

export function RobotFleet() {
  const robots = useApi<RobotSummary[]>("/api/robots");
  const params = useSearchParams();
  const router = useRouter();
  const ids = robots.data?.map((r) => r.robot_id) ?? [];
  const selected = params.get("robot") && ids.includes(params.get("robot")!) ? params.get("robot")! : ids[0] ?? null;
  const a = useApi<RobotPassport>(ids[0] ? `/api/robots/${ids[0]}` : null);
  const b = useApi<RobotPassport>(ids[1] ? `/api/robots/${ids[1]}` : null);
  const passports = [a, b];
  const current = passports.find((p) => p.data?.robot_id === selected);

  if (robots.error) return <ErrorNote message={robots.error} />;
  if (robots.loading) return <Loading label="Loading robot passports…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Robot Fleet</h1>
        <p className="mt-1 text-sm text-ink-2">
          Robot Passports generated from the loaded MuJoCo models. Every field is tagged as read from the model,
          measured in simulation, or declared by AgentNet.
        </p>
      </div>
      {a.data && b.data && <CapabilityComparison a={a.data} b={b.data} />}
      <div className="flex gap-2" role="tablist">
        {robots.data?.map((r) => (
          <button key={r.robot_id} role="tab" aria-selected={r.robot_id === selected}
            onClick={() => router.replace(`/robots?robot=${r.robot_id}`, { scroll: false })}
            className={`rounded-lg border px-4 py-2 text-left text-sm transition-colors ${r.robot_id === selected ? "border-accent-dim bg-accent/10 text-ink" : "border-line text-ink-2 hover:border-line-strong"}`}>
            <div className="font-medium">{r.display_name}</div>
            <div className="font-mono text-[11px] text-ink-3">{r.dof} DOF · reach {fmtM(r.max_reach_m, 0)} · {shortHash(r.model_hash)}</div>
          </button>
        ))}
      </div>
      {current?.error && <ErrorNote message={current.error} />}
      {current?.data ? <PassportView passport={current.data} /> : <Loading label="Loading passport…" />}
    </div>
  );
}
