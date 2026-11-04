import { type Pt } from "./geometry";
import { type P3 } from "./camera";

/** Small 3D vector helpers and flat lighting for the story's solids. */

export const add = (a: P3, b: P3): P3 => ({ x: a.x + b.x, h: a.h + b.h, d: a.d + b.d });
export const sub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, h: a.h - b.h, d: a.d - b.d });
export const mul = (a: P3, k: number): P3 => ({ x: a.x * k, h: a.h * k, d: a.d * k });
export const dot = (a: P3, b: P3) => a.x * b.x + a.h * b.h + a.d * b.d;
export const cross = (a: P3, b: P3): P3 => ({ x: a.h * b.d - a.d * b.h, h: a.d * b.x - a.x * b.d, d: a.x * b.h - a.h * b.x });
export const unit = (a: P3): P3 => mul(a, 1 / (Math.hypot(a.x, a.h, a.d) || 1));
export const AXIS = { x: { x: 1, h: 0, d: 0 }, h: { x: 0, h: 1, d: 0 }, d: { x: 0, h: 0, d: 1 } } as const;

/** Two unit vectors perpendicular to `k` and to each other. */
export function basis(k: P3): [P3, P3] {
  const helper = Math.abs(k.d) < 0.9 ? AXIS.d : AXIS.x;
  const u = unit(cross(k, helper));
  return [u, cross(k, u)];
}

/** Key light from high up, front left. */
const LIGHT = unit({ x: -0.35, h: 0.85, d: -0.4 });
export const lambert = (n: P3) => 0.3 + 0.7 * Math.max(0, dot(unit(n), LIGHT));

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a: string, b: string, t: number): string {
  const [p, q] = [rgb(a), rgb(b)];
  return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * t)).join(",")})`;
}

/** Convex hull (monotone chain) of screen points, for the silhouette of a projected cylinder. */
export function hull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Pt[]) => list.reduce<Pt[]>((acc, p) => {
    const next = [...acc];
    while (next.length >= 2 && turn(next[next.length - 2], next[next.length - 1], p) <= 0) next.pop();
    return [...next, p];
  }, []);
  const lower = half(pts), upper = half([...pts].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
