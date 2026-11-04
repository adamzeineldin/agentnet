import { MIRROR_X, WINNER, bezier, lerp, local, span, type Pt } from "./geometry";
import { type Camera, type P3, lift, polyline, project } from "./camera";
import { CARD, CARD_CENTRE } from "./hud";
import { INK } from "./scene3d";
import { ADAPT } from "./task";

const SAMPLES = Array.from({ length: 49 }, (_, i) => i / 48);
const mirrored = (q: P3): P3 => ({ ...q, x: 2 * MIRROR_X - q.x });

/** How far the card has lifted away as Adapt begins: progress, scale and rise in screen units. */
export function cardLift(p: number) {
  const out = p < 0.5 ? 0 : span(local(p, 2), 0, 0.22);
  return { out, k: lerp(1, 0.92, out), dy: -out * 36 };
}

/** Robot A's route as drawn in the card's thumbnail, in screen space, following the card as it lifts. */
function routeInCard(p: number, cam: Camera): Pt[] {
  const centre = project(cam, { x: 400, h: 110, d: 0 });
  const { k, dy } = cardLift(p);
  return SAMPLES.map((t) => {
    const q = project(cam, lift(bezier(WINNER, t)));
    const x = CARD.thumbX + (q.x - centre.x) * CARD.scale, y = CARD.thumbY + (q.y - centre.y) * CARD.scale;
    return { x: CARD_CENTRE.x + (x - CARD_CENTRE.x) * k, y: CARD_CENTRE.y + (y - CARD_CENTRE.y) * k + dy };
  });
}

/**
 * The link between Remember and Adapt: as the card lifts away, the route in its thumbnail slides out and settles in
 * front of Robot B as the dashed path B starts from, with a brief label saying whose route it is.
 */
export function Handoff({ p, cam }: { p: number; cam: Camera }) {
  if (p < 0.5 || p >= 0.75) return null;
  const u = local(p, 2);
  const [a, b] = ADAPT.handoff;
  if (u < a) return null;
  const m = span(u, a, b);
  const fade = 1 - span(u, b + 0.02, b + 0.08);
  const from = routeInCard(p, cam);
  const to = SAMPLES.map((t) => project(cam, mirrored(lift(bezier(WINNER, t)))));
  const d = polyline(from.map((f, i) => ({ x: lerp(f.x, to[i].x, m), y: lerp(f.y, to[i].y, m) })));
  const apex = to[24];
  const label = span(u, b - 0.06, b) * (1 - span(u, 0.62, 0.7));
  return (
    <g fill="none" strokeLinecap="round">
      {fade > 0 && (
        <g opacity={fade}>
          <path d={d} stroke={INK.good} strokeWidth={lerp(1.4, 2.5, m)} opacity={1 - m} filter="url(#glow)" />
          <path d={d} stroke={INK.accent} strokeWidth="2.5" strokeDasharray="4 9" opacity={0.6 * m} />
        </g>
      )}
      {label > 0 && (
        <text x={apex.x} y={apex.y - 14} textAnchor="middle" fontSize="12" fill={INK.accent} stroke="none" opacity={label}>
          Robot A&apos;s route
        </text>
      )}
    </g>
  );
}
