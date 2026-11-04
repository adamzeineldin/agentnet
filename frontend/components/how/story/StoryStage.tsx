import {
  ARM_A, ARM_B, START, TARGET, WINNER,
  bezier, clamp, head, lerp, local, mirror, mirrorCurve, solveArm, span, type ArmSpec, type Pt,
} from "./geometry";
import { type Camera, type P3, STAGE, cameraAt, lift, project } from "./camera";
import { Arm3D, ArmShadow, GhostArm, LOOK_A, LOOK_B, type ArmLook } from "./arm3d";
import { AngleChip, CARD_CENTRE, CardBack, CardFace, Checklist, MiniCard, ROBOT_DASH, WellClip } from "./hud";
import { Defs, Floor, INK, curveScreen, curveShadow } from "./scene3d";
import { ADAPT, Task, TaskFront, foldInto, handA, rise } from "./task";
import { Handoff, cardLift } from "./handoff";

const B_ROUTE = mirrorCurve(WINNER);
const GRIP_REACH = 26;
/** Robot B waits this far above its start knob, gripper open, while the task rises in front of it. */
const B_HOVER = 45;

function handB(p: number): Pt {
  const u2 = p < 0.5 ? 0 : p < 0.75 ? local(p, 2) : 1;
  const traced = span(u2, ...ADAPT.trace);
  if (traced > 0) return bezier(B_ROUTE, traced);
  const knob = mirror(START);
  return { x: knob.x, y: knob.y - B_HOVER * (1 - span(u2, ...ADAPT.lower)) };
}

/** Fingers close only when the hand is at a knob, and open as it moves away. */
const gripAt = (hand: Pt, knobs: Pt[]) => clamp(Math.min(...knobs.map((k) => Math.hypot(hand.x - k.x, hand.y - k.y))) / GRIP_REACH);

interface Actor { spec: ArmSpec; look: ArmLook; hand: Pt; knobs: Pt[]; opacity: number; lift: number }

function actors(p: number): Actor[] {
  const fadeA = p < 0.25 ? 1 : 1 - span(local(p, 1), 0.3, 0.6);
  const enterB = p < 0.5 ? 0 : p < 0.75 ? span(local(p, 2), 0, 0.25) : 1;
  return [
    { spec: ARM_A, look: LOOK_A, hand: handA(p), knobs: [START, TARGET], opacity: fadeA, lift: 0 },
    { spec: ARM_B, look: LOOK_B, hand: handB(p), knobs: [mirror(START), mirror(TARGET)], opacity: enterB, lift: (1 - enterB) * 30 },
  ].filter((a) => a.opacity > 0);
}

interface CardState { opacity: number; face: number; transform: string }

/**
 * The card forms around the folded task during Remember and holds there. As Adapt begins it lifts away and fades
 * while Robot B comes in and the task rises in front of B, so the two overlap rather than leave an empty beat.
 */
function cardState(p: number): CardState {
  if (p < 0.25 || p >= 0.75) return { opacity: 0, face: 0, transform: "" };
  if (p < 0.5) {
    const u = local(p, 1);
    return { opacity: span(u, 0.45, 0.62), face: span(u, 0.6, 0.72), transform: "" };
  }
  const { out, k, dy } = cardLift(p);
  if (out >= 1) return { opacity: 0, face: 0, transform: "" };
  const transform = `translate(${CARD_CENTRE.x} ${CARD_CENTRE.y + dy}) scale(${k}) translate(${-CARD_CENTRE.x} ${-CARD_CENTRE.y})`;
  return { opacity: 1 - out, face: 1, transform };
}

/** The scene's own copy of the task is shown until it has folded into the card, and again once it rises for B. */
const worldTaskShown = (p: number) => (p < 0.5 ? foldInto(p) < 1 : rise(p) > 0.01);
const thumbShown = (p: number) => p >= 0.25 && foldInto(p) >= 1;

function RobotRoute({ p, cam }: { p: number; cam: Camera }) {
  if (p < 0.5) return null;
  const u2 = p < 0.75 ? local(p, 2) : 1;
  const traced = span(u2, ...ADAPT.trace);
  const [g0, g1] = ADAPT.ghosts;
  const ghosts = u2 < g0 ? 0 : u2 < g0 + 0.05 ? span(u2, g0, g0 + 0.04) : 1 - span(u2, g0 + 0.05, g1);
  return (
    <>
      {ghosts > 0 && [0.3, 0.55, 0.8].map((t) => (
        <GhostArm key={t} cam={cam} pose={solveArm(ARM_B, bezier(B_ROUTE, t))} color={INK.accent} opacity={ghosts * 0.16} />
      ))}
      {traced > 0 && (
        <>
          <path d={curveShadow(cam, head(B_ROUTE, traced))} stroke="#000" strokeOpacity=".16" strokeWidth="5" fill="none" filter="url(#soft)" />
          <path d={curveScreen(cam, head(B_ROUTE, traced))} fill="none" stroke={INK.accent} strokeWidth="3" strokeLinecap="round" filter="url(#glow)" />
        </>
      )}
    </>
  );
}

function AngleChips({ p, cam }: { p: number; cam: Camera }) {
  if (p < 0.25 || p >= 0.5) return null;
  const u1 = local(p, 1);
  const pose = solveArm(ARM_A, TARGET);
  return (
    <>
      {[pose.shoulder, pose.elbow, pose.wrist].map((j, i) => {
        const at = project(cam, lift(j));
        return (
          <AngleChip key={i} at={{ x: at.x, y: at.y - 40 }} label={`θ${"₁₂₃"[i]}`}
            strike={span(u1, 0.05 + i * 0.04, 0.2 + i * 0.04)} drop={span(u1, 0.25 + i * 0.05, 0.5 + i * 0.05)} />
        );
      })}
    </>
  );
}

function Verdict({ p }: { p: number }) {
  if (p < 0.75) return null;
  const u = local(p, 3);
  const child = span(u, 0.65, 0.9);
  return (
    <g>
      <Checklist opacity={span(u, 0.1, 0.2)} ticks={[0, 1, 2, 3].map((i) => span(u, 0.16 + i * 0.08, 0.22 + i * 0.08))} stamp={span(u, 0.5, 0.62)} />
      <g opacity={child}>
        <MiniCard x={282} y={26} dash={ROBOT_DASH.a} name="Robot A" sub="Reach past a wall" />
        <path d="M490 59 h36 m-6 -5 l6 5 l-6 5" stroke={INK.dim} strokeWidth="1.5" fill="none" />
      </g>
      <MiniCard x={534} y={lerp(68, 26, child)} dash={ROBOT_DASH.b} name="Robot B" sub="Adapted from Robot A" opacity={child} accent />
    </g>
  );
}

/** The whole story as one SVG, drawn purely from scroll progress `p` in [0, 1]. */
export function StoryStage({ p }: { p: number }) {
  const cam = cameraAt(p);
  const cast = actors(p).map((a) => ({ ...a, pose: solveArm(a.spec, a.hand), grip: gripAt(a.hand, a.knobs) }));
  const lead = cast.reduce((a, b) => (b.opacity > a.opacity ? b : a), cast[0]);
  const probe: P3 = lift(lead ? lead.hand : START);
  const card = cardState(p);
  const world = worldTaskShown(p);
  return (
    <svg viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} aria-hidden="true" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <Defs />
      <defs><WellClip /></defs>
      <Floor cam={cam} />
      {cast.map((a) => <ArmShadow key={a.spec.base.x} cam={cam} spec={a.spec} pose={a.pose} opacity={a.opacity} />)}
      {card.opacity > 0 && <g transform={card.transform} opacity={card.opacity}><CardBack /></g>}
      {cast.map((a) => (
        <g key={a.spec.base.x} transform={`translate(0 ${a.lift})`}>
          <Arm3D cam={cam} spec={a.spec} pose={a.pose} look={a.look} grip={a.grip} opacity={a.opacity} layer="far" />
        </g>
      ))}
      {world && <Task p={p} cam={cam} probe={probe} mode="world" />}
      <RobotRoute p={p} cam={cam} />
      {cast.map((a) => (
        <g key={a.spec.base.x} transform={`translate(0 ${a.lift})`}>
          <Arm3D cam={cam} spec={a.spec} pose={a.pose} look={a.look} grip={a.grip} opacity={a.opacity} />
        </g>
      ))}
      {world && <TaskFront p={p} cam={cam} probe={probe} />}
      {card.opacity > 0 && (
        <g transform={card.transform} opacity={card.opacity}>
          {thumbShown(p) && <g clipPath="url(#card-well)"><Task p={p} cam={cam} probe={probe} mode="thumb" /></g>}
          <g opacity={card.face}><CardFace /></g>
        </g>
      )}
      <Handoff p={p} cam={cam} />
      <AngleChips p={p} cam={cam} />
      <Verdict p={p} />
    </svg>
  );
}
