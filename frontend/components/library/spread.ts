import type { TaskGroup } from "../skills/grouping";

/** Who worked a skill out and who picked it up from them. */
export interface SkillSpread {
  /** Robots that learned it themselves, in fleet order. */
  teachers: string[];
  /** Robots that learned it from another robot, and from which one. */
  learners: { robotId: string; from: string }[];
}

export function spreadOf(group: TaskGroup): SkillSpread {
  const teachers = group.byRobot.filter((b) => !b.latest.parent_skill_id).map((b) => b.robotId);
  const learners = group.byRobot.filter((b) => !!b.latest.parent_skill_id).map((b) => ({
    robotId: b.robotId, from: String(b.latest.provenance.transferred_from_robot ?? ""),
  }));
  // A skill whose original was removed still has a teacher: the robot its learners name.
  const named = [...new Set(learners.map((l) => l.from).filter(Boolean))];
  return { teachers: teachers.length ? teachers : named, learners };
}

/** Distinct skills (task layouts) a robot knows, split by how it got them. */
export function robotSkillCounts(groups: TaskGroup[], robotId: string): { own: number; learned: number } {
  const mine = groups.flatMap((g) => g.byRobot.filter((b) => b.robotId === robotId));
  const learned = mine.filter((b) => !!b.latest.parent_skill_id).length;
  return { own: mine.length - learned, learned };
}
