"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/lib/useApi";
import type { RobotPassport, RobotSummary } from "@/lib/types";
import { CapabilityComparison } from "./CapabilityComparison";
import { RobotCard } from "./RobotCard";
import { PassportView } from "./PassportView";
import { Term } from "./Term";
import { ErrorNote, Loading, PageHeader } from "./ui";

export function RobotFleet() {
  const robots = useApi<RobotSummary[]>("/api/robots");
  const params = useSearchParams();
  const router = useRouter();
  const ids = robots.data?.map((r) => r.robot_id) ?? [];
  const selected = params.get("robot") && ids.includes(params.get("robot")!) ? params.get("robot")! : ids[0] ?? null;
  const a = useApi<RobotPassport>(ids[0] ? `/api/robots/${ids[0]}` : null);
  const b = useApi<RobotPassport>(ids[1] ? `/api/robots/${ids[1]}` : null);
  const current = useApi<RobotPassport>(selected ? `/api/robots/${selected}` : null);

  if (robots.error) return <ErrorNote message={robots.error} />;
  if (robots.loading) return <Loading label="Loading robot passports…" />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="The robots" title="Robot Fleet">
        The two robot arms in this project and what each can do: joints, limits and reach. Each robot&apos;s facts form
        its <Term id="passport">passport</Term>, and every fact says where it came from: read from the robot&apos;s
        model, measured in simulation, or written by us.
      </PageHeader>
      {robots.data?.length === 0 && <p className="text-sm text-ink-3">No robot passports available.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {robots.data?.map((r) => <div key={r.robot_id} className={r.robot_id === selected ? "border-b-2 border-ink" : "border-b-2 border-transparent"}>
          <button className="w-full text-left" aria-pressed={r.robot_id === selected}
            onClick={() => router.replace(`/robots?robot=${r.robot_id}`, { scroll: false })}>
            <RobotCard robot={r} />
          </button>
        </div>)}
      </div>
      {a.data && b.data && <CapabilityComparison a={a.data} b={b.data} />}
      {current?.error && <ErrorNote message={current.error} />}
      {current.data ? <PassportView passport={current.data} /> : selected && !current.error ? <Loading label="Loading passport…" /> : null}
    </div>
  );
}
