import { taskTitleOf } from "@/lib/tasks";
import type { ExperienceCapsule, RobotSummary } from "@/lib/types";

/** One task (a layout) and every robot's saved way of doing it. */
export interface TaskGroup {
  sceneId: string;
  capsules: ExperienceCapsule[];
  /** Newest saved solution per robot, in fleet order. */
  byRobot: { robotId: string; latest: ExperienceCapsule; saves: number }[];
  newest: string;
}

export const TRACE_COLORS = ["var(--accent)", "var(--good)", "var(--warn)", "var(--ink-2)", "var(--bad)", "var(--ink-3)", "var(--data)"];

/** Skills are stored one per robot per run; people think in tasks. Group the stored capsules by task layout. */
export function groupByTask(skills: ExperienceCapsule[], robots: RobotSummary[]): TaskGroup[] {
  const order = new Map(robots.map((r, i) => [r.robot_id, i]));
  const groups = new Map<string, ExperienceCapsule[]>();
  for (const s of skills) groups.set(s.task.scene_id, [...(groups.get(s.task.scene_id) ?? []), s]);
  return [...groups.entries()].map(([sceneId, capsules]) => {
    const robotIds = [...new Set(capsules.map((c) => c.source_robot_id))]
      .sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
    const byRobot = robotIds.map((robotId) => {
      const mine = capsules.filter((c) => c.source_robot_id === robotId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { robotId, latest: mine[0], saves: mine.length };
    });
    const newest = capsules.map((c) => c.created_at).sort().at(-1)!;
    return { sceneId, capsules, byRobot, newest };
  }).sort((a, b) => b.newest.localeCompare(a.newest));
}

/** "Reach past a wall · layout 7" / "Reach onto a shelf · layout 3". */
export function taskTitle(c: ExperienceCapsule): string {
  return `${taskTitleOf(c.task)} · layout ${c.task.seed}`;
}
