import { FLOOR_Y, ease, lerp, type Pt } from "./geometry";

/** World point: x along the task, h above the floor, d into the scene (0 is the arms' plane). */
export interface P3 { x: number; h: number; d: number }
export interface Screen extends Pt { s: number }
export interface Camera { yaw: number; pitch: number; cx: number; cy: number; zoom: number }

export const STAGE = { w: 1000, h: 540 };
const FOCAL = 1500;
const PIVOT = { x: 400, h: 110 };

/** A side-plane point from geometry.ts (y grows downward) lifted into the world at depth `d`. */
export const lift = (p: Pt, d = 0): P3 => ({ x: p.x, h: FLOOR_Y - p.y, d });

/** The camera orbits slowly from one side of the task to the other as the story scrolls. */
export function cameraAt(p: number): Camera {
  const t = ease(p);
  return { yaw: lerp(-0.5, 0.42, t), pitch: lerp(0.36, 0.28, t), cx: STAGE.w / 2, cy: 338, zoom: 1.08 };
}

/** Rotate a world-space offset into camera space: right, up, and depth (larger is farther). */
function view(cam: Camera, x: number, h: number, d: number) {
  const r = x * Math.cos(cam.yaw) + d * Math.sin(cam.yaw);
  const y1 = -x * Math.sin(cam.yaw) + d * Math.cos(cam.yaw);
  return { r, up: h * Math.cos(cam.pitch) + y1 * Math.sin(cam.pitch), depth: y1 * Math.cos(cam.pitch) - h * Math.sin(cam.pitch) };
}

export function project(cam: Camera, p: P3): Screen {
  const v = view(cam, p.x - PIVOT.x, p.h - PIVOT.h, p.d);
  const s = (FOCAL / (FOCAL + v.depth)) * cam.zoom;
  return { x: cam.cx + v.r * s, y: cam.cy - v.up * s, s };
}

/** True when a face with this outward normal turns toward the camera. */
export const facesCamera = (cam: Camera, n: P3) => view(cam, n.x, n.h, n.d).depth < 0;

/** Where a point's shadow lands on the floor under a light high up and to the left, behind the camera. */
export const shadowOf = (p: P3): P3 => ({ x: p.x + p.h * 0.32, h: 0, d: p.d - p.h * 0.45 });

export const polyline = (pts: Pt[]) => pts.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" ");
