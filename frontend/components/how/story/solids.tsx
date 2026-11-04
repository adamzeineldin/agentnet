import { useId } from "react";
import { type Pt } from "./geometry";
import { type Camera, type P3, facesCamera, polyline, project, shadowOf } from "./camera";
import { add, basis, hull, lambert, mix, mul, sub, unit } from "./shade";

/** A surface: `lo`/`hi` are its shadow and lit colours, `cap` the flat end of a cylinder, `ring` a trim colour. */
export interface Material { lo: string; mid: string; hi: string; cap: string; ring: string }

export const MATERIALS = {
  metal: { lo: "#59606a", mid: "#c4c9cf", hi: "#f7f8f9", cap: "#e6e9ec", ring: "#d65a31" },
  accent: { lo: "#7a2c12", mid: "#e2602f", hi: "#ffb18c", cap: "#ef7447", ring: "#3a3f45" },
  dark: { lo: "#15181b", mid: "#3a4047", hi: "#7d868f", cap: "#4b535b", ring: "#9aa2aa" },
} satisfies Record<string, Material>;

const ring = (c: P3, u: P3, v: P3, r: number, n = 24): P3[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return add(c, add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r)));
  });

interface CylinderProps { cam: Camera; a: P3; b: P3; r: number; m: Material; trim?: boolean; opacity?: number }

/** A lit cylinder from `a` to `b`: silhouette shaded across its width, plus the end cap that faces the camera. */
export function Cylinder({ cam, a, b, r, m, trim, opacity = 1 }: CylinderProps) {
  const id = useId();
  const k = unit(sub(b, a));
  const [u, v] = basis(k);
  const ra = ring(a, u, v, r), rb = ring(b, u, v, r);
  const sa = ra.map((q) => project(cam, q)), sb = rb.map((q) => project(cam, q));
  const outline = hull([...sa, ...sb]);
  const pa = project(cam, a), pb = project(cam, b);
  const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  let n: Pt = len > 0.5 ? { x: -(pb.y - pa.y) / len, y: (pb.x - pa.x) / len } : { x: -0.6, y: -0.8 };
  if (-n.y * 0.8 - n.x * 0.6 < 0) n = { x: -n.x, y: -n.y };
  const reach = Math.max(...outline.map((q) => (q.x - pa.x) * n.x + (q.y - pa.y) * n.y));
  const from = { x: pa.x - n.x * reach, y: pa.y - n.y * reach }, to = { x: pa.x + n.x * reach, y: pa.y + n.y * reach };
  const capAtB = facesCamera(cam, k);
  const cap = capAtB ? sb : sa;
  const centre = capAtB ? pb : pa;
  return (
    <g opacity={opacity}>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={to.x} y2={to.y}>
        <stop offset="0" stopColor={m.lo} />
        <stop offset=".5" stopColor={m.mid} />
        <stop offset=".8" stopColor={m.hi} />
        <stop offset="1" stopColor={m.mid} />
      </linearGradient>
      <path d={`${polyline(outline)} Z`} fill={`url(#${id})`} stroke={m.lo} strokeOpacity=".35" strokeWidth=".8" />
      <path d={`${polyline(cap)} Z`} fill={mix(m.lo, m.cap, lambert(capAtB ? k : mul(k, -1)) * 1.1)} stroke={m.lo} strokeOpacity=".4" strokeWidth=".8" />
      {trim && (
        <>
          <path d={`${polyline(ring(capAtB ? b : a, u, v, r * 0.78).map((q) => project(cam, q)))} Z`} fill="none" stroke={m.ring} strokeWidth={1.6 * centre.s} />
          <circle cx={centre.x} cy={centre.y} r={r * 0.22 * centre.s} fill={m.lo} opacity=".55" />
        </>
      )}
    </g>
  );
}

interface BlockProps { cam: Camera; c: P3; axes: [P3, P3, P3]; half: [number, number, number]; m: Material; opacity?: number }

/** An oriented box with each visible face lit by its normal. */
export function Block({ cam, c, axes, half, m, opacity = 1 }: BlockProps) {
  const faces = axes.flatMap((axis, i) => [1, -1].map((s) => {
    const [j, k] = [0, 1, 2].filter((x) => x !== i);
    const centre = add(c, mul(axis, s * half[i]));
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([p, q]) =>
      add(centre, add(mul(axes[j], p * half[j]), mul(axes[k], q * half[k]))));
    return { n: mul(axis, s), corners };
  }));
  return (
    <g opacity={opacity} strokeLinejoin="round">
      {faces.filter((f) => facesCamera(cam, f.n)).map((f, i) => (
        <path key={i} d={`${polyline(f.corners.map((q) => project(cam, q)))} Z`} fill={mix(m.lo, m.hi, lambert(f.n))}
          stroke={m.lo} strokeOpacity=".45" strokeWidth=".8" />
      ))}
    </g>
  );
}

/** Soft shadow an upright box or column casts on the floor, so it reads as standing on it. */
export function DropShadow({ cam, min, max, opacity = 1 }: { cam: Camera; min: P3; max: P3; opacity?: number }) {
  const corners: P3[] = [];
  for (const x of [min.x, max.x]) for (const d of [min.d, max.d]) {
    corners.push({ x, h: 0, d }, shadowOf({ x, h: max.h, d }));
  }
  return <path d={`${polyline(hull(corners.map((q) => project(cam, q))))} Z`} fill="#000" opacity={0.16 * opacity} filter="url(#soft)" />;
}

/** Contact darkening right where something meets the floor. */
export function Contact({ cam, at, r, opacity = 1 }: { cam: Camera; at: P3; r: number; opacity?: number }) {
  const pts = ring({ ...at, h: 0 }, { x: 1, h: 0, d: 0 }, { x: 0, h: 0, d: 1 }, r, 20).map((q) => project(cam, q));
  return <path d={`${polyline(pts)} Z`} fill="#000" opacity={0.22 * opacity} filter="url(#soft)" />;
}
