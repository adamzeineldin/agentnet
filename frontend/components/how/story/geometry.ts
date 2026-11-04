/** Geometry and timing for the landing page's How it works illustration. Side view, SVG units, y grows downward. */

export type Pt = { x: number; y: number };
export type Curve = [Pt, Pt, Pt, Pt];

export const FLOOR_Y = 410;
export const WALL = { x: 385, w: 30, top: 265 };
export const START: Pt = { x: 290, y: 360 };
export const TARGET: Pt = { x: 510, y: 360 };
/** The task is symmetric about this x, so mirroring it for Robot B swaps start and target. */
export const MIRROR_X = 400;

const straight: Curve = [START, { x: 363, y: 360 }, { x: 437, y: 360 }, TARGET];
const lowArc: Curve = [START, { x: 330, y: 255 }, { x: 470, y: 255 }, TARGET];
const highArc: Curve = [START, { x: 315, y: 120 }, { x: 485, y: 120 }, TARGET];
/** Robot A's attempts in order; the last one clears the wall. */
export const ATTEMPTS: Curve[] = [straight, lowArc, highArc];
export const WINNER = highArc;

/** Kinematics plus the radii the drawing uses, so contact is tested against what is drawn. */
export interface ArmSpec {
  base: Pt; pedestal: number; l1: number; l2: number; tool: number;
  link: [number, number]; drum: [number, number, number];
}
/** Two different bodies: different reach, link proportions, mount height and side. */
export const ARM_A: ArmSpec = { base: { x: 120, y: FLOOR_Y }, pedestal: 140, l1: 235, l2: 205, tool: 80, link: [10, 8], drum: [15, 12, 7] };
export const ARM_B: ArmSpec = { base: { x: 690, y: FLOOR_Y }, pedestal: 190, l1: 215, l2: 250, tool: 70, link: [11, 9], drum: [16, 13, 7] };
/** Gripper extent along the tool, from the fingertip centre (the hand point): below, up to the palm top, half width.
 * The gripper is the widest part at the end of the arm, so on a failed try it is what meets the wall. */
export const GRIPPER = { below: 4, above: 24, half: 9, flange: 5.5 };

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** 0 before `a`, 1 after `b`, eased in between. */
export const span = (u: number, a: number, b: number) => ease(clamp((u - a) / (b - a)));

export function bezier([p0, p1, p2, p3]: Curve, t: number): Pt {
  const s = 1 - t;
  const k0 = s * s * s, k1 = 3 * s * s * t, k2 = 3 * s * t * t, k3 = t * t * t;
  return { x: k0 * p0.x + k1 * p1.x + k2 * p2.x + k3 * p3.x, y: k0 * p0.y + k1 * p1.y + k2 * p2.y + k3 * p3.y };
}

/** The first `t` of a curve (de Casteljau), so a partly drawn route ends exactly at the hand. */
export function head(c: Curve, t: number): Curve {
  const mid = (a: Pt, b: Pt): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const [p0, p1, p2, p3] = c;
  const a = mid(p0, p1), b = mid(p1, p2), d = mid(p2, p3);
  const e = mid(a, b), f = mid(b, d);
  return [p0, a, e, mid(e, f)];
}


export const mirror = (p: Pt): Pt => ({ x: 2 * MIRROR_X - p.x, y: p.y });
export const mirrorCurve = (c: Curve): Curve => c.map(mirror) as Curve;

export interface ArmPose { shoulder: Pt; elbow: Pt; wrist: Pt; hand: Pt }

/** Planar two-link IK, elbow up, with an optional tool link that always points down. */
export function solveArm(spec: ArmSpec, hand: Pt): ArmPose {
  const shoulder = { x: spec.base.x, y: spec.base.y - spec.pedestal };
  const wrist = { x: hand.x, y: hand.y - spec.tool };
  const dx = wrist.x - shoulder.x, dy = wrist.y - shoulder.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(spec.l1 - spec.l2) + 1, spec.l1 + spec.l2 - 1);
  const a = Math.atan2(dy, dx);
  const b = Math.acos(clamp((spec.l1 ** 2 + d ** 2 - spec.l2 ** 2) / (2 * spec.l1 * d), -1, 1));
  const options = [a + b, a - b].map((ang) => ({ x: shoulder.x + spec.l1 * Math.cos(ang), y: shoulder.y + spec.l1 * Math.sin(ang) }));
  const elbow = options[0].y < options[1].y ? options[0] : options[1];
  const reach = Math.hypot(dx, dy) > d ? d / Math.hypot(dx, dy) : 1;
  const w = { x: shoulder.x + dx * reach, y: shoulder.y + dy * reach };
  return { shoulder, elbow, wrist: w, hand: { x: w.x, y: w.y + spec.tool } };
}

export interface Capsule { a: Pt; b: Pt; r: number }

/** The drawn arm as capsules in the side plane: links, joint housings, flange and gripper. */
export function capsules(spec: ArmSpec, hand: Pt): Capsule[] {
  const { shoulder: S, elbow: E, wrist: W, hand: H } = solveArm(spec, hand);
  return [
    { a: S, b: E, r: spec.link[0] }, { a: E, b: W, r: spec.link[1] },
    { a: S, b: S, r: spec.drum[0] }, { a: E, b: E, r: spec.drum[1] }, { a: W, b: W, r: spec.drum[2] },
    { a: W, b: { x: H.x, y: H.y - GRIPPER.above }, r: GRIPPER.flange },
    { a: { x: H.x, y: H.y + GRIPPER.below }, b: { x: H.x, y: H.y - GRIPPER.above }, r: GRIPPER.half },
  ];
}

/** Signed gap between a capsule and the wall (negative inside), with the nearest point on the capsule's axis. */
function wallGap(c: Capsule): { gap: number; at: Pt } {
  let best = { gap: Infinity, at: c.a };
  for (let i = 0; i <= 24; i++) {
    const at = { x: lerp(c.a.x, c.b.x, i / 24), y: lerp(c.a.y, c.b.y, i / 24) };
    const dx = Math.max(WALL.x - at.x, 0, at.x - WALL.x - WALL.w), dy = Math.max(WALL.top - at.y, 0, at.y - FLOOR_Y);
    const out = dx || dy ? Math.hypot(dx, dy) : -Math.min(at.x - WALL.x, WALL.x + WALL.w - at.x, at.y - WALL.top);
    if (out - c.r < best.gap) best = { gap: out - c.r, at };
  }
  return best;
}

/** Closest approach of any part of the arm to the wall, and where on the arm it happens. */
export function armWallGap(spec: ArmSpec, hand: Pt): { gap: number; at: Pt } {
  return capsules(spec, hand).map(wallGap).reduce((a, b) => (b.gap < a.gap ? b : a));
}

/** Fraction of the curve travelled before any part of the arm first touches the wall, or 1 when none does. */
export function hitT(c: Curve, spec: ArmSpec): number {
  const steps = 400;
  for (let i = 0; i <= steps; i++) if (armWallGap(spec, bezier(c, i / steps)).gap <= 0) return i / steps;
  return 1;
}

/** Each scene owns a quarter of the scroll; `u` is the progress inside it. */
export const SCENES = 4;
export const sceneAt = (p: number) => Math.min(SCENES - 1, Math.floor(clamp(p) * SCENES));
export const local = (p: number, scene: number) => clamp(p * SCENES - scene);
