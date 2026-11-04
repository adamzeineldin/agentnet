import type { TaskDesign, TaskSpec } from "./types";

/** Task types the robots can learn (backend services/task_families.py). Titles are used before /api/tasks loads. */
export interface TaskTypeInfo { family: string; title: string; summary: string; example: TaskSpec | null; design?: TaskDesign | null }

export const DEFAULT_FAMILY = "wall_reach_v1";

export const TASK_TITLES: Record<string, string> = {
  wall_reach_v1: "Reach past a wall",
  wall_roof_v1: "Reach under a roof",
  tall_wall_v1: "Reach around a tall wall",
  fence_v1: "Reach over a long fence",
  shelf_v1: "Reach onto a shelf",
  posts_v1: "Reach between two posts",
};

/** Task types designed from a description have ids like "custom_reach_into_an_open_box_bfb7bf". */
export const DESIGNED_PREFIX = "custom_";

/** "shelf_v1_s42" → "shelf_v1"; "custom_reach_under_a_beam_1a2b3c_s0" → "custom_reach_under_a_beam_1a2b3c". */
export function familyOf(sceneId: string): string {
  const family = sceneId.replace(/_s\d+$/, "");
  return TASK_TITLES[family] || family.startsWith(DESIGNED_PREFIX) ? family : DEFAULT_FAMILY;
}

/** A designed task's layout description starts with its title ("Reach into an open box. Designed from …"). */
export function taskTitleOf(task: TaskSpec): string {
  return TASK_TITLES[familyOf(task.scene_id)] ?? task.description.split(". ")[0];
}

/** A fresh layout number; every number builds a different layout of the same task type. */
export function randomLayout(): number {
  return 1 + Math.floor(Math.random() * 9999);
}
