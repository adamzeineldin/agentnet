"use client";

import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { fmtMetres } from "@/lib/format";
import type { RobotSummary } from "@/lib/types";

interface RobotPairProps {
  robots: RobotSummary[];
  source: string;
  target: string;
  disabled: boolean;
  onChange: (source: string, target: string) => void;
}

function Seat({ role, robot, robots, exclude, disabled, onPick }: {
  role: string; robot: RobotSummary; robots: RobotSummary[]; exclude?: string; disabled: boolean; onPick: (id: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-panel-2/60 p-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- MuJoCo render served by the backend */}
      <img src={apiUrl(robot.snapshot_url)} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-ink-3">{role}</span>
        <select value={robot.robot_id} disabled={disabled} onChange={(e) => onPick(e.target.value)} aria-label={role}
          className="w-full border border-line-strong bg-panel px-3 py-2 text-sm text-ink">
          {robots.filter((r) => r.robot_id !== exclude).map((r) => (
            <option key={r.robot_id} value={r.robot_id}>{r.short_name}</option>
          ))}
        </select>
        <span className="truncate text-[11px] text-ink-3">{robot.dof} joints · reaches {fmtMetres(robot.max_reach_m)}</span>
      </label>
    </div>
  );
}

/** Choose which robot teaches and which learns. They must differ. */
export function RobotPair({ robots, source, target, disabled, onChange }: RobotPairProps) {
  const s = robots.find((r) => r.robot_id === source)!;
  const t = robots.find((r) => r.robot_id === target)!;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Seat role="Teacher" robot={s} robots={robots} disabled={disabled}
          onPick={(id) => onChange(id, id === target ? robots.find((r) => r.robot_id !== id)!.robot_id : target)} />
        <button type="button" onClick={() => onChange(target, source)} disabled={disabled} aria-label="Swap teacher and learner"
          className="pill justify-center self-center px-3">⇄</button>
        <Seat role="Learner" robot={t} robots={robots} exclude={source} disabled={disabled} onPick={(id) => onChange(source, id)} />
      </div>
      <p className="text-xs text-ink-3">Want other robots? <Link href="/robots" className="text-accent hover:underline">Add more on the Robots page</Link>.</p>
    </div>
  );
}
