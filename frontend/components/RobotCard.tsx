import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { fmtM, shortHash } from "@/lib/format";
import type { RobotSummary } from "@/lib/types";
import { Badge, Stat } from "./ui";

export function RobotCard({ robot, href }: { robot: RobotSummary; href?: string }) {
  const body = (
    <article className="group overflow-hidden rounded-xl border border-line bg-panel transition-colors hover:border-line-strong">
      <div className="relative aspect-video bg-panel-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the backend from MuJoCo state */}
        <img src={apiUrl(robot.snapshot_url)} alt={`${robot.short_name} rendered in MuJoCo at its home pose`}
          className="size-full object-cover" />
        <div className="absolute top-2 left-2 flex gap-1.5">
          <Badge tone="accent">simulated</Badge>
          {robot.fallback_model && <Badge tone="warn">fallback model</Badge>}
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <h3 className="font-medium">{robot.display_name}</h3>
          <p className="font-mono text-[11px] text-ink-3">{robot.model_source} · {shortHash(robot.model_hash)}</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Arm DOF" value={robot.dof} />
          <Stat label="Max reach" value={fmtM(robot.max_reach_m, 0)} hint="sampled" />
          <Stat label="Tool" value={<span className="text-sm">{robot.tool_type.split(" ")[0]}</span>} />
        </div>
      </div>
    </article>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
