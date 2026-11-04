import * as THREE from "three";
import type { BoxSpec, Vec3 } from "@/lib/types";

/** How a route is drawn: the chosen one boldest, unchecked ones faintest. */
export type RouteTone = "chosen" | "passed" | "possible" | "failed" | "pending";

export interface SceneRoute {
  id: string;
  /** Task-frame points: MuJoCo's recorded hand path when the route was simulated, else its planned waypoints. */
  points: Vec3[];
  tone: RouteTone;
}

/** Everything in the task frame (metres, +x away from the robot, +z up), straight from the stored task. */
export interface SceneContent {
  start: Vec3;
  target: Vec3;
  obstacles: BoxSpec[];
  /** Where the robot base stands, when the placement is known. */
  base?: Vec3 | null;
  routes?: SceneRoute[];
}

export interface Palette {
  ink: string; faint: string; line: string; accent: string; good: string; bad: string; box: string;
}

const TUBE: Record<RouteTone, { radius: number; opacity: number }> = {
  chosen: { radius: 0.007, opacity: 1 },
  passed: { radius: 0.004, opacity: 0.75 },
  possible: { radius: 0.003, opacity: 0.45 },
  failed: { radius: 0.003, opacity: 0.55 },
  pending: { radius: 0.0025, opacity: 0.25 },
};

const toneColor = (tone: RouteTone, p: Palette): string =>
  tone === "chosen" || tone === "passed" ? p.good : tone === "failed" ? p.bad : p.faint;

const v = ([x, y, z]: Vec3) => new THREE.Vector3(x, y, z);

/** Consecutive duplicates break a tube's curve; a route needs two distinct points to be drawn at all. */
function distinct(points: Vec3[]): THREE.Vector3[] {
  return points.map(v).filter((p, i, all) => i === 0 || p.distanceTo(all[i - 1]) > 1e-4);
}

function routeMesh(route: SceneRoute, p: Palette): THREE.Mesh | null {
  const pts = distinct(route.points);
  if (pts.length < 2) return null;
  const { radius, opacity } = TUBE[route.tone];
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const geometry = new THREE.TubeGeometry(curve, Math.min(400, pts.length * 6), radius, 8, false);
  const material = new THREE.MeshBasicMaterial({ color: toneColor(route.tone, p), transparent: opacity < 1, opacity });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = route.tone === "chosen" ? 2 : 1;
  return mesh;
}

function boxMesh(box: BoxSpec, p: Palette): THREE.Group {
  const [hx, hy, hz] = box.half_size;
  const geometry = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: p.box, roughness: 0.9, transparent: true, opacity: 0.82,
  })));
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: p.ink, transparent: true, opacity: 0.35 })));
  group.position.copy(v(box.center));
  return group;
}

function marker(at: Vec3, radius: number, color: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
  mesh.position.copy(v(at));
  return mesh;
}

function baseMesh(at: Vec3, p: Palette): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(0.06, 0.07, 0.03, 40);
  geometry.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: p.ink, roughness: 0.6, transparent: true, opacity: 0.55 }));
  mesh.position.set(at[0], at[1], 0.015);
  return mesh;
}

/** The floor: a grid of 10 cm squares around the scene, so distances can be read by eye. */
function floor(box: THREE.Box3, p: Palette): THREE.GridHelper {
  const size = Math.ceil(Math.max(box.max.x - box.min.x, box.max.y - box.min.y, 0.6) * 10 + 4) / 10;
  const grid = new THREE.GridHelper(size, Math.round(size * 10), p.line, p.line);
  grid.rotateX(Math.PI / 2);
  const c = box.getCenter(new THREE.Vector3());
  grid.position.set(Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, 0);
  return grid;
}

/** The bounds the camera frames: obstacles, start, target, base and every route point. */
export function bounds(c: SceneContent): THREE.Box3 {
  const box = new THREE.Box3();
  [c.start, c.target, ...(c.base ? [c.base] : []), ...(c.routes ?? []).flatMap((r) => r.points)].forEach((pt) => box.expandByPoint(v(pt)));
  c.obstacles.forEach((o) => {
    box.expandByPoint(v(o.center).sub(v(o.half_size)));
    box.expandByPoint(v(o.center).add(v(o.half_size)));
  });
  box.expandByPoint(new THREE.Vector3(box.min.x, box.min.y, 0));
  return box;
}

/** A fresh group holding the whole scene; the caller disposes the previous one. */
export function buildScene(c: SceneContent, p: Palette): THREE.Group {
  const group = new THREE.Group();
  group.add(floor(bounds(c), p));
  c.obstacles.forEach((o) => group.add(boxMesh(o, p)));
  if (c.base) group.add(baseMesh(c.base, p));
  (c.routes ?? []).forEach((r) => {
    const mesh = routeMesh(r, p);
    if (mesh) group.add(mesh);
  });
  group.add(marker(c.start, 0.014, p.ink));
  group.add(marker(c.target, 0.018, p.accent));
  return group;
}

/** Free every geometry and material under `root` (WebGL memory is not garbage-collected). */
export function dispose(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    mats.forEach((mat) => mat.dispose());
  });
}

/** The theme's colours, read from the page's CSS tokens so the scene matches light and dark mode. */
export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    ink: get("--ink", "#17191b"), faint: get("--faint", "#9a9ea2"), accent: get("--accent", "#d65a31"),
    good: get("--good", "#3f8f5f"), bad: get("--bad", "#b83d31"),
    line: dark ? "#2a2d30" : "#dcdcd8", box: dark ? "#4a4e52" : "#cfccc4",
  };
}
