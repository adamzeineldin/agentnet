import { type ArmPose, type ArmSpec, GRIPPER, lerp } from "./geometry";
import { type Camera, type P3, facesCamera, lift, polyline, project, shadowOf } from "./camera";
import { Block, Contact, Cylinder, DropShadow, MATERIALS, type Material } from "./solids";
import { AXIS } from "./shade";

/** How an arm is built, beyond its kinematics: material, column or box pedestal, and part sizes. */
export interface ArmLook { m: Material; column: boolean }

export const LOOK_A: ArmLook = { m: MATERIALS.metal, column: true };
export const LOOK_B: ArmLook = { m: MATERIALS.accent, column: false };

/** Gripper layout along the tool, measured up from the fingertip centre (the arm's hand point); see GRIPPER. */
const GRIP = { palm: GRIPPER.above - 4, palmTop: GRIPPER.above, fingerTop: GRIPPER.above - 8, fingerTip: -GRIPPER.below, closed: 10.5, open: 15 };
const TURRET = 16;

const up = (p: P3, h: number): P3 => ({ ...p, h: p.h + h });
const across = (p: P3, half: number): [P3, P3] => [{ ...p, d: p.d - half }, { ...p, d: p.d + half }];

function Pedestal({ cam, spec, look }: { cam: Camera; spec: ArmSpec; look: ArmLook }) {
  const foot: P3 = { x: spec.base.x, h: 0, d: 0 };
  const top = spec.pedestal - TURRET;
  return (
    <>
      {look.column
        ? <Cylinder cam={cam} a={foot} b={up(foot, 7)} r={40} m={MATERIALS.dark} />
        : <Block cam={cam} c={up(foot, 3.5)} axes={[AXIS.x, AXIS.h, AXIS.d]} half={[40, 3.5, 40]} m={MATERIALS.dark} />}
      {look.column
        ? <Cylinder cam={cam} a={up(foot, 7)} b={up(foot, top)} r={22} m={look.m} />
        : <Block cam={cam} c={up(foot, (7 + top) / 2)} axes={[AXIS.x, AXIS.h, AXIS.d]} half={[22, (top - 7) / 2, 22]} m={look.m} />}
      <Cylinder cam={cam} a={up(foot, top)} b={up(foot, spec.pedestal - 2)} r={18} m={MATERIALS.dark} />
    </>
  );
}

interface ArmProps { cam: Camera; spec: ArmSpec; pose: ArmPose; look: ArmLook; grip: number; opacity?: number; layer?: "far" | "main" }

/**
 * A lit arm: pedestal and turret, tube links meeting inside cylindrical joint housings, and a two-finger gripper.
 * The far finger is its own layer so it can sit behind the knob the gripper closes around.
 */
export function Arm3D({ cam, spec, pose, look, grip, opacity = 1, layer = "main" }: ArmProps) {
  const [S, E, W, H] = [pose.shoulder, pose.elbow, pose.wrist, pose.hand].map((q) => lift(q));
  const [d0, d1, d2] = spec.drum;
  const spread = lerp(GRIP.closed, GRIP.open, grip);
  const nearIsFront = facesCamera(cam, { x: 0, h: 0, d: -1 });
  const finger = (side: number) => (
    <Block key={side} cam={cam} c={{ ...H, h: H.h + (GRIP.fingerTop + GRIP.fingerTip) / 2, d: side * spread }}
      axes={[AXIS.x, AXIS.h, AXIS.d]} half={[3.2, (GRIP.fingerTop - GRIP.fingerTip) / 2, 2.2]} m={MATERIALS.dark} />
  );
  const [far, near] = nearIsFront ? [1, -1] : [-1, 1];
  if (layer === "far") return <g opacity={opacity}>{finger(far)}</g>;
  return (
    <g opacity={opacity}>
      <Pedestal cam={cam} spec={spec} look={look} />
      <Cylinder cam={cam} a={S} b={E} r={spec.link[0]} m={look.m} />
      <Cylinder cam={cam} {...drum(S, d0)} r={d0} m={look.m} trim />
      <Cylinder cam={cam} a={E} b={W} r={spec.link[1]} m={look.m} />
      <Cylinder cam={cam} {...drum(E, d1)} r={d1} m={look.m} trim />
      <Cylinder cam={cam} a={W} b={up(H, GRIP.palmTop)} r={GRIPPER.flange} m={MATERIALS.dark} />
      <Cylinder cam={cam} {...drum(W, d2)} r={d2} m={look.m} trim />
      <Block cam={cam} c={up(H, GRIP.palm)} axes={[AXIS.x, AXIS.h, AXIS.d]} half={[GRIPPER.half, 4, GRIP.open + 3]} m={MATERIALS.dark} />
      {finger(near)}
    </g>
  );
}

const drum = (c: P3, r: number) => {
  const [a, b] = across(c, r * 1.1);
  return { a, b };
};

/** Soft floor shadows of the pedestal and links, plus contact darkening at the foot. */
export function ArmShadow({ cam, spec, pose, opacity = 1 }: { cam: Camera; spec: ArmSpec; pose: ArmPose; opacity?: number }) {
  const pts = [pose.shoulder, pose.elbow, pose.wrist, pose.hand].map((q) => project(cam, shadowOf(lift(q))));
  const foot = { x: spec.base.x, h: 0, d: 0 };
  return (
    <g opacity={opacity}>
      <Contact cam={cam} at={foot} r={46} />
      <DropShadow cam={cam} min={{ x: foot.x - 22, h: 0, d: -22 }} max={{ x: foot.x + 22, h: spec.pedestal, d: 22 }} />
      <g opacity=".2" filter="url(#soft)" stroke="#000" strokeLinecap="round" fill="none">
        <path d={polyline(pts.slice(0, 3))} strokeWidth={spec.link[0] * 2.2} />
        <path d={polyline(pts.slice(2))} strokeWidth="12" />
      </g>
    </g>
  );
}

/** A translucent outline of a pose the arm is only considering ("imagination"). */
export function GhostArm({ cam, pose, color, opacity }: { cam: Camera; pose: ArmPose; color: string; opacity: number }) {
  const pts = [pose.shoulder, pose.elbow, pose.wrist, pose.hand].map((q) => project(cam, lift(q)));
  return (
    <g opacity={opacity} stroke={color} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d={polyline(pts.slice(0, 3))} strokeWidth={18 * pts[0].s} />
      <path d={polyline(pts.slice(2))} strokeWidth={10 * pts[2].s} />
      {pts.slice(0, 3).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={(14 - i * 3) * p.s} fill={color} stroke="none" />)}
    </g>
  );
}
