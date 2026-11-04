import {
  ARM_A, ATTEMPTS, FLOOR_Y, MIRROR_X, START, TARGET, WALL, WINNER,
  bezier, clamp, ease, head, hitT, local, span, type Pt,
} from "./geometry";
import { type Camera, type P3, lift, project } from "./camera";
import { CARD } from "./hud";
import { GlassWall, INK, Post, Spark, curveScreen, curveShadow } from "./scene3d";
import { MATERIALS } from "./solids";

/** Scroll windows for Robot A's three tries inside the Learn scene. */
const TRIES: [number, number][] = [[0.04, 0.3], [0.3, 0.56], [0.56, 0.92]];
const HITS = ATTEMPTS.map((c) => hitT(c, ARM_A));
/** Where each failed try stops: the end of its dashed route, with the gripper against the wall. */
const CONTACTS: Pt[] = ATTEMPTS.map((c, i) => bezier(c, HITS[i]));

/**
 * Adapt's beats, as fractions of that scene: the card's route sliding out to B, the task rising for B, B lowering onto
 * its knob, previews, the run, and the dashed route that stays once the slide is done.
 */
export const ADAPT = {
  handoff: [0.04, 0.38], rise: [0.12, 0.4], lower: [0.42, 0.5], ghosts: [0.46, 0.62], trace: [0.56, 0.96], memory: [0.4, 0.46],
} as const;

interface Try { drawn: number; hand: number; failed: boolean; impact: number }

/** How far try `i` has drawn its route and where the hand is on it. Failed tries run to the wall, then back. */
function tryState(u: number, i: number): Try {
  const [a, b] = TRIES[i];
  const w = clamp((u - a) / (b - a));
  if (HITS[i] === 1) return { drawn: ease(w), hand: ease(w), failed: false, impact: 0 };
  const out = HITS[i] * ease(clamp(w / 0.6));
  return { drawn: out, hand: out * (1 - ease(clamp((w - 0.72) / 0.28))), failed: w > 0.6, impact: clamp((w - 0.58) / 0.25) };
}

export function handA(p: number): Pt {
  if (p >= 0.25) return TARGET;
  const u = local(p, 0);
  const active = TRIES.findLastIndex(([a]) => u >= a);
  return active < 0 ? START : bezier(ATTEMPTS[active], tryState(u, active).hand);
}

const learnU = (p: number) => (p < 0.25 ? local(p, 0) : 1);
const failedFade = (p: number) => (p < 0.25 ? 1 : 1 - span(local(p, 1), 0, 0.3));
const wallFlash = (u0: number) => Math.max(...[0, 1].map((i) => { const t = tryState(u0, i).impact; return t > 0 && t < 1 ? 1 - t : 0; }));

/** How far the learned task has folded into the card's thumbnail during Remember. */
export const foldInto = (p: number) => (p < 0.25 ? 0 : p < 0.5 ? span(local(p, 1), 0.35, 0.65) : 1);
/** How far the task has risen out of the floor in front of Robot B during Adapt. */
export const rise = (p: number) => (p < 0.5 ? 0 : p < 0.75 ? span(local(p, 2), ...ADAPT.rise) : 1);

/**
 * Where a copy of the task is drawn. "world" is the scene itself: Robot A's task, folding into the card during
 * Remember, then Robot B's mirrored copy rising from the floor. "thumb" is the copy that lives in the card.
 */
export type TaskMode = "world" | "thumb";

function view(p: number, cam: Camera, mode: TaskMode) {
  const centre = project(cam, { x: 400, h: 110, d: 0 });
  const thumbAt = (k: number) =>
    `translate(${centre.x + (CARD.thumbX - centre.x) * k} ${centre.y + (CARD.thumbY - centre.y) * k}) scale(${1 + (CARD.scale - 1) * k}) translate(${-centre.x} ${-centre.y})`;
  if (mode === "thumb") return { transform: thumbAt(1), toWorld: (q: P3) => q, mirrored: false };
  if (p < 0.5) return { transform: thumbAt(foldInto(p)), toWorld: (q: P3) => q, mirrored: false };
  const g = rise(p);
  return { transform: undefined, toWorld: (q: P3): P3 => ({ ...q, x: 2 * MIRROR_X - q.x, h: q.h * g }), mirrored: true };
}

function wallBox(toWorld: (q: P3) => P3): [P3, P3] {
  const a = toWorld({ x: WALL.x, h: 0, d: -70 }), b = toWorld({ x: WALL.x + WALL.w, h: FLOOR_Y - WALL.top, d: 70 });
  return [{ ...a, x: Math.min(a.x, b.x) }, { ...b, x: Math.max(a.x, b.x) }];
}

interface TaskProps { p: number; cam: Camera; probe: P3; mode: TaskMode }

/** The posts, the glass faces in front of the gripper, and the routes; drawn under the arms. */
export function Task({ p, cam, probe, mode }: TaskProps) {
  const { transform, toWorld, mirrored } = view(p, cam, mode);
  const u0 = learnU(p);
  const leaving = mode === "thumb" && p >= 0.5 && local(p, 2) >= ADAPT.handoff[0];
  const won = mode === "thumb" ? (leaving ? 0 : 1) : tryState(u0, 2).drawn;
  const [wMin, wMax] = wallBox(toWorld);
  const lit = mode === "world" && p < 0.25 ? span(u0, 0.9, 1) : mode === "world" && p >= 0.75 ? span(local(p, 3), 0, 0.35) : 0;
  const memory = mirrored ? span(local(p, 2), ...ADAPT.memory) * (p < 0.75 ? 1 : 1 - span(local(p, 3), 0, 0.2)) : 0;
  const fails = mode === "world" && !mirrored ? failedFade(p) : 0;
  return (
    <g transform={transform}>
      {!mirrored && won > 0 && <path d={curveShadow(cam, head(WINNER, won), toWorld)} stroke="#000" strokeOpacity=".16" strokeWidth="5" fill="none" filter="url(#soft)" />}
      <Post cam={cam} at={toWorld(lift(START))} m={MATERIALS.metal} />
      <Post cam={cam} at={toWorld(lift(TARGET))} m={MATERIALS.accent} lit={lit} />
      <GlassWall cam={cam} min={wMin} max={wMax} flash={mode === "world" ? wallFlash(u0) : 0} probe={probe} layer={mode === "thumb" ? "all" : "back"} />
      {fails > 0 && ATTEMPTS.map((c, i) => {
        const s = tryState(u0, i);
        if (HITS[i] === 1 || s.drawn <= 0) return null;
        return <path key={i} opacity={fails} d={curveScreen(cam, head(c, s.drawn), toWorld)} fill="none" stroke={INK.bad} strokeWidth="2" strokeDasharray="5 6" />;
      })}
      {!mirrored && won > 0 && (
        <path d={curveScreen(cam, head(WINNER, won), toWorld)} fill="none" strokeWidth="3" strokeLinecap="round" stroke={INK.good} filter="url(#glow)" />
      )}
      {memory > 0 && (
        <path d={curveScreen(cam, WINNER, toWorld)} fill="none" strokeWidth="2.5" stroke={INK.accent} strokeDasharray="4 9" opacity={memory * 0.6} />
      )}
    </g>
  );
}

/** Glass faces the gripper is behind, and the impact marks on the wall's surface; drawn over the arms. */
export function TaskFront({ p, cam, probe }: { p: number; cam: Camera; probe: P3 }) {
  const { transform, toWorld, mirrored } = view(p, cam, "world");
  const u0 = learnU(p);
  const [wMin, wMax] = wallBox(toWorld);
  const fails = mirrored ? 0 : failedFade(p);
  return (
    <g transform={transform}>
      <GlassWall cam={cam} min={wMin} max={wMax} flash={wallFlash(u0)} probe={probe} layer="front" />
      {fails > 0 && [0, 1].map((i) => {
        const s = tryState(u0, i);
        if (!s.failed) return null;
        const contact = project(cam, toWorld(lift(CONTACTS[i])));
        return (
          <g key={i} opacity={fails}>
            <Spark at={contact} t={s.impact} />
            {s.impact >= 1 && (
              <path d={`M${contact.x - 6} ${contact.y - 6} l12 12 M${contact.x + 6} ${contact.y - 6} l-12 12`} stroke={INK.bad} strokeWidth="2.5" strokeLinecap="round" />
            )}
          </g>
        );
      })}
    </g>
  );
}
