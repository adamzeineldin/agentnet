"use client";

import type { RobotSummary } from "@/lib/types";

interface RobotPairProps {
  robots: RobotSummary[];
  source: string;
  target: string;
  disabled: boolean;
  onChange: (source: string, target: string) => void;
}

function Picker({ label, value, robots, exclude, disabled, onPick }: {
  label: string; value: string; robots: RobotSummary[]; exclude?: string; disabled: boolean; onPick: (id: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs text-ink-3">{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onPick(e.target.value)} aria-label={label}
        className="border border-line-strong bg-panel px-3 py-2 text-sm text-ink">
        {robots.filter((r) => r.robot_id !== exclude).map((r) => (
          <option key={r.robot_id} value={r.robot_id}>{r.short_name} · {r.dof} joints</option>
        ))}
      </select>
    </label>
  );
}

/** Choose which fleet arm teaches and which learns. They must differ. */
export function RobotPair({ robots, source, target, disabled, onChange }: RobotPairProps) {
  const swap = () => onChange(target, source);
  return (
    <div className="soft-card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
      <Picker label="Teacher (learns first)" value={source} robots={robots} disabled={disabled}
        onPick={(id) => onChange(id, id === target ? robots.find((r) => r.robot_id !== id)!.robot_id : target)} />
      <button type="button" onClick={swap} disabled={disabled} aria-label="Swap teacher and learner"
        className="pill justify-center self-center px-3 sm:mb-0.5">⇄</button>
      <Picker label="Learner (adapts it)" value={target} robots={robots} exclude={source} disabled={disabled}
        onPick={(id) => onChange(source, id)} />
    </div>
  );
}
