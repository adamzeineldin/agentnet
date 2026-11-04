import type { Placement, Vec3 } from "./types";

/** Where the task origin sits relative to the robot, in the robot's own frame (+x = in front of it): the arm's
 * mount for an uploaded robot carried by another body, otherwise the base. A catalog arm gives its translation. */
export function taskOffset(p: Placement): [number, number] {
  const [bx, by] = p.mount ?? [0, 0, 0];
  const [tx, ty] = p.translation;
  const c = Math.cos(p.yaw_rad), s = Math.sin(p.yaw_rad);
  const dx = tx - bx, dy = ty - by;
  return [c * dx + s * dy, -s * dx + c * dy];
}

/** How far in front of the robot (its mount or base) the task origin is placed, in metres. */
export function inFront(p: Placement): number {
  return taskOffset(p)[0];
}

/** The robot's base (or mount) in the task frame, on the task's floor. */
export function baseInTask(p: Placement): Vec3 {
  const [ox, oy] = taskOffset(p);
  return [-ox, -oy, 0];
}
