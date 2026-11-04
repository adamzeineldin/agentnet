import { taskTitleOf } from "@/lib/tasks";
import type { RobotSummary } from "@/lib/types";
import type { TaskGroup } from "../skills/grouping";
import { spreadOf } from "./spread";
import { PrivateBadge } from "./Visibility";

const NAMED_LEARNERS = 2;

/** "Panda → UR5e, Arm 0 +11": who worked it out, then who learned it from them. */
export function spreadLine(group: TaskGroup, name: (id: string) => string): string {
  const { teachers, learners } = spreadOf(group);
  const head = teachers.map(name).join(", ");
  if (learners.length === 0) return `${head} only`;
  const named = learners.slice(0, NAMED_LEARNERS).map((l) => name(l.robotId)).join(", ");
  const more = learners.length > NAMED_LEARNERS ? ` +${learners.length - NAMED_LEARNERS}` : "";
  return `${head} → ${named}${more}`;
}

interface SkillRowProps {
  group: TaskGroup;
  robots: RobotSummary[];
  onOpen: () => void;
}

/** One skill as a line of text: its name, who knows it and how many. The picture waits on the skill's own page. */
export function SkillRow({ group, robots, onOpen }: SkillRowProps) {
  const task = group.byRobot[0].latest.task;
  const name = (id: string) => robots.find((r) => r.robot_id === id)?.short_name ?? id;
  const count = group.byRobot.length;
  const line = spreadLine(group, name);
  return (
    <li>
      <button type="button" onClick={onOpen} aria-label={`Open ${taskTitleOf(task)} · layout ${task.seed}`}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 text-left transition-colors hover:bg-panel-2/60 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <span className="min-w-0">
          <span className="block truncate font-medium">{taskTitleOf(task)} <span className="font-normal text-ink-3">· layout {task.seed}</span>
            {group.byRobot.some((b) => b.latest.visibility === "private") && <> <PrivateBadge /></>}</span>
          <span className="block truncate text-xs text-ink-3 sm:hidden">{line}</span>
        </span>
        <span className="hidden truncate text-sm text-ink-2 sm:block">{line}</span>
        <span className="whitespace-nowrap text-xs text-ink-3">{count} {count === 1 ? "robot" : "robots"} <span aria-hidden="true">›</span></span>
      </button>
    </li>
  );
}

export const LIST = "soft-card divide-y divide-line overflow-hidden";
