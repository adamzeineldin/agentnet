import Link from "next/link";
import type { RobotSummary } from "@/lib/types";
import { Avatar } from "./Avatar";

interface RobotPickerProps {
  robots: RobotSummary[];
  value: string;
  disabled: boolean;
  onPick: (robotId: string) => void;
}

/** Which robot should do the task: one row of avatars, like the Library's chips, scrolling sideways. */
export function RobotPicker({ robots, value, disabled, onPick }: RobotPickerProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div role="radiogroup" aria-label="Robot" className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none]">
        {robots.map((r) => (
          <button key={r.robot_id} type="button" role="radio" aria-checked={value === r.robot_id} disabled={disabled}
            onClick={() => onPick(r.robot_id)} title={`${r.dof} joints`}
            className={`flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-sm transition-colors disabled:opacity-60 ${
              value === r.robot_id ? "bg-ink text-bg" : "text-ink-2 hover:bg-panel-2 hover:text-ink"}`}>
            <Avatar robot={r} />{r.short_name}
          </button>
        ))}
      </div>
      <Link href="/library?view=robots" className="shrink-0 text-xs text-accent hover:underline">+ Add</Link>
    </div>
  );
}
