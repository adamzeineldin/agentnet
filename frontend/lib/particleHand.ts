// Geometry and forward kinematics for the decorative particle hand on the home screen.
// Pure functions only: the canvas component owns the animation loop and pixel state.

export type Vec3 = readonly [number, number, number];

/** A particle is anchored to one rigid body (palm, wrist or phalanx) in that body's local frame. */
export interface HandParticle {
  readonly body: number;
  readonly local: Vec3;
  readonly size: number;
  readonly delay: number;
}

interface FingerSpec {
  readonly base: Vec3;
  readonly lengths: readonly number[];
  readonly radius: number;
  readonly splay: number;
  readonly twist: number;
  readonly maxCurl: readonly number[];
}

// Hand space: fingers point +y, palm faces the viewer (+z), units ≈ palm half-width.
const FINGERS: readonly FingerSpec[] = [
  // thumb
  { base: [-0.46, -0.36, 0.08], lengths: [0.36, 0.3, 0.24], radius: 0.085, splay: 0.62, twist: -0.75, maxCurl: [0.4, 0.6, 0.65] },
  { base: [-0.33, 0.32, 0], lengths: [0.46, 0.28, 0.22], radius: 0.075, splay: 0.12, twist: 0, maxCurl: [1.1, 1.25, 0.9] },
  { base: [-0.11, 0.36, 0], lengths: [0.5, 0.31, 0.24], radius: 0.078, splay: 0.03, twist: 0, maxCurl: [1.15, 1.3, 0.95] },
  { base: [0.11, 0.34, 0], lengths: [0.47, 0.29, 0.22], radius: 0.075, splay: -0.05, twist: 0, maxCurl: [1.2, 1.3, 0.95] },
  { base: [0.33, 0.27, 0], lengths: [0.37, 0.23, 0.19], radius: 0.068, splay: -0.16, twist: 0, maxCurl: [1.25, 1.3, 0.95] },
];

export const PALM_BODY = 0;
export const WRIST_BODY = 1;
const FIRST_PHALANX_BODY = 2;
const PHALANGES_PER_FINGER = 3;
export const BODY_COUNT = FIRST_PHALANX_BODY + FINGERS.length * PHALANGES_PER_FINGER;

const PALM = { halfX: 0.48, yMin: -0.62, yMax: 0.32, halfZ: 0.13 } as const;
const WRIST = { radius: 0.3, yMin: -1.15, yMax: -0.6 } as const;

type Mat3 = readonly [Vec3, Vec3, Vec3];

const rotX = (a: number): Mat3 => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const rotY = (a: number): Mat3 => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const rotZ = (a: number): Mat3 => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];

export function mulMat(a: Mat3, b: Mat3): Mat3 {
  const row = (r: Vec3): Vec3 => [
    r[0] * b[0][0] + r[1] * b[1][0] + r[2] * b[2][0],
    r[0] * b[0][1] + r[1] * b[1][1] + r[2] * b[2][1],
    r[0] * b[0][2] + r[1] * b[1][2] + r[2] * b[2][2],
  ];
  return [row(a[0]), row(a[1]), row(a[2])];
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Deterministic PRNG so the server and client agree and the shape is stable across reloads. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function palmParticles(rand: () => number, count: number): HandParticle[] {
  const { halfX, yMin, yMax, halfZ } = PALM;
  return Array.from({ length: count }, () => {
    // Bias toward the front and back faces so the palm reads as a plate with visible edges.
    const face = rand();
    const x = (rand() * 2 - 1) * halfX;
    const y = yMin + rand() * (yMax - yMin);
    const z = face < 0.42 ? halfZ : face < 0.84 ? -halfZ : (rand() * 2 - 1) * halfZ;
    const edge = face >= 0.84;
    const local: Vec3 = edge ? [rand() < 0.5 ? -halfX : halfX, y, z] : [x, y, z];
    return { body: PALM_BODY, local, size: 0.8 + rand() * 0.9, delay: rand() };
  });
}

function cylinderParticles(rand: () => number, body: number, radius: number, y0: number, y1: number, count: number) {
  return Array.from({ length: count }, (): HandParticle => {
    const theta = rand() * Math.PI * 2;
    const t = y0 + rand() * (y1 - y0);
    return { body, local: [Math.cos(theta) * radius, t, Math.sin(theta) * radius], size: 0.7 + rand() * 0.8, delay: rand() };
  });
}

/** Builds the particle cloud once; positions are local so curling needs no regeneration. */
export function buildHandParticles(density = 1, seed = 7): HandParticle[] {
  const rand = mulberry32(seed);
  const n = (k: number) => Math.max(8, Math.round(k * density));
  const phalanges = FINGERS.flatMap((f, fi) =>
    f.lengths.flatMap((len, pi) => {
      const radius = f.radius * (1 - pi * 0.12);
      return cylinderParticles(rand, FIRST_PHALANX_BODY + fi * PHALANGES_PER_FINGER + pi, radius, 0.02, len - 0.02, n(len * 260));
    }),
  );
  return [
    ...palmParticles(rand, n(900)),
    ...cylinderParticles(rand, WRIST_BODY, WRIST.radius, WRIST.yMin, WRIST.yMax, n(320)),
    ...phalanges,
  ];
}

export interface BodyPose {
  readonly origin: Vec3;
  readonly rot: Mat3;
}

export interface HandPose {
  readonly bodies: readonly BodyPose[];
  /** Joint centres (knuckles + fingertips), drawn as brighter actuator nodes. */
  readonly joints: readonly Vec3[];
  /** Pairs of joint indices forming the visible skeleton. */
  readonly bones: readonly (readonly [number, number])[];
}

const IDENTITY: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** Forward kinematics: `curl[f]` in [0, 1] closes finger f toward the palm. */
export function solveHandPose(curl: readonly number[]): HandPose {
  const bodies: BodyPose[] = [
    { origin: [0, 0, 0], rot: IDENTITY },
    { origin: [0, 0, 0], rot: IDENTITY },
  ];
  const joints: Vec3[] = [[0, WRIST.yMin, 0], [0, PALM.yMin, 0]];
  const bones: [number, number][] = [[0, 1]];

  FINGERS.forEach((f, fi) => {
    const base = mulMat(rotZ(f.splay), rotY(f.twist));
    const c = Math.min(1, Math.max(0, curl[fi] ?? 0));
    let origin = f.base;
    let angle = 0;
    const baseJoint = joints.length;
    joints.push(origin);
    bones.push([1, baseJoint]);
    f.lengths.forEach((len, pi) => {
      angle += f.maxCurl[pi] * c;
      const rot = mulMat(base, rotX(angle));
      bodies.push({ origin, rot });
      origin = add(origin, apply(rot, [0, len, 0]));
      joints.push(origin);
      bones.push([joints.length - 2, joints.length - 1]);
    });
  });

  return { bodies, joints, bones };
}

export function particleWorld(p: HandParticle, pose: HandPose): Vec3 {
  const b = pose.bodies[p.body];
  return add(b.origin, apply(b.rot, p.local));
}

/** Rotation applied to the whole hand to present it to the camera. */
export function viewRotation(yaw: number, pitch: number, roll: number): Mat3 {
  return mulMat(mulMat(rotY(yaw), rotX(pitch)), rotZ(roll));
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** A slow open/close grasp cycle with a pinky-to-index wave so the fingers don't move in lockstep. */
export function graspCurl(timeS: number): number[] {
  return FINGERS.map((_, fi) => {
    const phase = fi === 0 ? 0.35 : (4 - fi) * 0.22;
    const s = 0.5 - 0.5 * Math.cos((timeS * 0.55 - phase) * Math.PI * 0.5);
    return 0.08 + 0.82 * smooth(s);
  });
}
