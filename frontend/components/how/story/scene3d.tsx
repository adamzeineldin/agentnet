import { type Curve, bezier } from "./geometry";
import { type Camera, type P3, facesCamera, lift, polyline, project, shadowOf } from "./camera";
import { Contact, Cylinder, DropShadow, MATERIALS, type Material } from "./solids";

/** Scene colours follow the site theme; the arm materials in solids.tsx are fixed. */
export const INK = {
  bg: "var(--bg)", grid: "var(--ink)", text: "var(--ink)", dim: "var(--ink-3)",
  good: "var(--good)", bad: "var(--bad)", accent: "var(--accent)",
};

export function Defs() {
  return (
    <defs>
      <radialGradient id="spot" cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor={INK.accent} stopOpacity=".14" />
        <stop offset=".5" stopColor={INK.accent} stopOpacity=".04" />
        <stop offset="1" stopColor={INK.accent} stopOpacity="0" />
      </radialGradient>
      <radialGradient id="fade" cx="50%" cy="55%" r="60%">
        <stop offset=".35" stopColor="#fff" />
        <stop offset="1" stopColor="#000" />
      </radialGradient>
      <mask id="floor-fade"><rect width="100%" height="100%" fill="url(#fade)" /></mask>
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" /></filter>
      <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#000" floodOpacity=".1" />
      </filter>
    </defs>
  );
}

const GRID = { x0: -200, x1: 1000, d0: -360, d1: 360, step: 40 };

/** A perspective floor grid that fades toward the edges, with a warm pool of light under the task. */
export function Floor({ cam }: { cam: Camera }) {
  const lines: string[] = [];
  for (let x = GRID.x0; x <= GRID.x1; x += GRID.step) {
    lines.push(polyline([project(cam, { x, h: 0, d: GRID.d0 }), project(cam, { x, h: 0, d: GRID.d1 })]));
  }
  for (let d = GRID.d0; d <= GRID.d1; d += GRID.step) {
    lines.push(polyline([project(cam, { x: GRID.x0, h: 0, d }), project(cam, { x: GRID.x1, h: 0, d })]));
  }
  const pool = Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return project(cam, { x: 400 + Math.cos(a) * 330, h: 0, d: Math.sin(a) * 260 });
  });
  return (
    <g>
      <path d={`${polyline(pool)} Z`} fill="url(#spot)" />
      <g mask="url(#floor-fade)">
        <path d={lines.join(" ")} stroke={INK.grid} strokeOpacity=".07" strokeWidth="1" fill="none" />
      </g>
    </g>
  );
}

interface WallProps { cam: Camera; min: P3; max: P3; flash?: number; probe: P3; layer: "back" | "front" | "all" }

/**
 * The obstacle: a glass slab standing on the floor. It is drawn in two passes around the arms: a face the camera sees
 * goes in the front pass only when the probe (the gripper) is on the slab's side of that face, i.e. behind the glass.
 * "all" draws every face in one pass, for a copy with no arm near it.
 */
export function GlassWall({ cam, min, max, flash = 0, probe, layer }: WallProps) {
  const c = (x: number, h: number, d: number) => project(cam, { x: x ? max.x : min.x, h: h ? max.h : min.h, d: d ? max.d : min.d });
  const faces: { n: P3; on: P3; q: [number, number, number][]; a: number }[] = [
    { n: { x: 0, h: 1, d: 0 }, on: max, q: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], a: 0.16 },
    { n: { x: -1, h: 0, d: 0 }, on: min, q: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], a: 0.08 },
    { n: { x: 1, h: 0, d: 0 }, on: max, q: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], a: 0.08 },
    { n: { x: 0, h: 0, d: -1 }, on: min, q: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], a: 0.04 },
    { n: { x: 0, h: 0, d: 1 }, on: max, q: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], a: 0.04 },
  ];
  const probeBehind = (f: typeof faces[number]) =>
    (probe.x - f.on.x) * f.n.x + (probe.h - f.on.h) * f.n.h + (probe.d - f.on.d) * f.n.d < 0;
  const shown = faces.filter((f) => {
    const seen = facesCamera(cam, f.n);
    if (layer === "all") return true;
    return layer === "front" ? seen && probeBehind(f) : !seen || !probeBehind(f);
  });
  return (
    <g strokeLinejoin="round">
      {layer !== "front" && <DropShadow cam={cam} min={min} max={max} opacity={0.8} />}
      {layer !== "front" && <Contact cam={cam} at={{ x: (min.x + max.x) / 2, h: 0, d: 0 }} r={30} opacity={0.6} />}
      {shown.map((f, i) => {
        const seen = facesCamera(cam, f.n);
        const red = flash > 0 && f.n.x === -1;
        return (
          <path key={i} d={`${polyline(f.q.map(([x, h, d]) => c(x, h, d)))} Z`}
            fill={red ? INK.bad : INK.text} fillOpacity={seen ? f.a + (red ? flash * 0.25 : 0) : 0.02}
            stroke={INK.text} strokeOpacity={seen ? 0.32 : 0.12} strokeWidth="1.2" />
        );
      })}
    </g>
  );
}

interface PostProps { cam: Camera; at: P3; m: Material; lit?: number; litColor?: string }

/** A start or target point: a knob on a slim post, its top centred on the point the gripper closes around. */
export function Post({ cam, at, m, lit = 0, litColor = INK.good }: PostProps) {
  const foot: P3 = { ...at, h: 0 };
  const knob = project(cam, at);
  return (
    <g>
      <Contact cam={cam} at={foot} r={16} />
      <Cylinder cam={cam} a={foot} b={{ ...foot, h: 3 }} r={13} m={MATERIALS.dark} />
      {at.h > 9 && <Cylinder cam={cam} a={{ ...foot, h: 3 }} b={{ ...at, h: at.h - 5 }} r={4.5} m={MATERIALS.metal} />}
      <Cylinder cam={cam} a={{ ...at, h: Math.max(0, at.h - 5) }} b={{ ...at, h: Math.max(1, at.h + 5) }} r={8} m={m} />
      {lit > 0 && lit < 1 && (
        <circle cx={knob.x} cy={knob.y} r={(10 + lit * 34) * knob.s} fill="none" stroke={litColor} strokeWidth="2.5" opacity={1 - lit} />
      )}
    </g>
  );
}

/** A short burst at the point where a try hits the wall. */
export function Spark({ at, t }: { at: { x: number; y: number }; t: number }) {
  if (t <= 0 || t >= 1) return null;
  const rays = [-150, -110, -70, -30, 30, 150];
  return (
    <g stroke={INK.bad} strokeLinecap="round" opacity={1 - t} filter="url(#glow)">
      {rays.map((deg) => {
        const a = (deg * Math.PI) / 180, r0 = 6 + t * 10, r1 = 10 + t * 22;
        return <path key={deg} d={`M${at.x + Math.cos(a) * r0} ${at.y + Math.sin(a) * r0} L${at.x + Math.cos(a) * r1} ${at.y + Math.sin(a) * r1}`} strokeWidth="2.2" />;
      })}
    </g>
  );
}

/** Screen-space outline of a curve in the arms' plane, sampled finely enough to stay smooth in perspective. */
export function curveScreen(cam: Camera, c: Curve, toWorld: (p: P3) => P3 = (p) => p, n = 48) {
  return polyline(Array.from({ length: n + 1 }, (_, i) => project(cam, toWorld(lift(bezier(c, i / n))))));
}

export function curveShadow(cam: Camera, c: Curve, toWorld: (p: P3) => P3 = (p) => p, n = 32) {
  return polyline(Array.from({ length: n + 1 }, (_, i) => project(cam, shadowOf(toWorld(lift(bezier(c, i / n)))))));
}
