import type { TaskSpec } from "./types";

/** Task types the robots can learn (backend services/task_families.py). Titles are used before /api/tasks loads. */
export interface TaskTypeInfo { family: string; title: string; summary: string; example: TaskSpec }

export const DEFAULT_FAMILY = "wall_reach_v1";

export const TASK_TITLES: Record<string, string> = {
  wall_reach_v1: "Reach past a wall",
  wall_roof_v1: "Reach under a roof",
  tall_wall_v1: "Reach around a tall wall",
  fence_v1: "Reach over a long fence",
  shelf_v1: "Reach onto a shelf",
  posts_v1: "Reach between two posts",
};

/** "shelf_v1_s42" → "shelf_v1". */
export function familyOf(sceneId: string): string {
  return Object.keys(TASK_TITLES).find((f) => sceneId.startsWith(`${f}_s`)) ?? DEFAULT_FAMILY;
}

export function taskTitleOf(sceneId: string): string {
  return TASK_TITLES[familyOf(sceneId)];
}

/** A fresh layout number; every number builds a different layout of the same task type. */
export function randomLayout(): number {
  return 1 + Math.floor(Math.random() * 9999);
}
