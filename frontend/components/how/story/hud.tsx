import { type Pt } from "./geometry";
import { INK } from "./scene3d";

/** Flat overlay pieces drawn in screen space on top of the 3D scene, styled like the site's soft cards. */

export const ROBOT_DASH = { a: "#9aa1a8", b: "#e2602f" };
export const CARD = { x: 220, y: 22, w: 560, h: 202, well: { x: 236, y: 38, w: 190, h: 148 }, thumbX: 331, thumbY: 114, scale: 0.4 };
export const CARD_CENTRE = { x: CARD.x + CARD.w / 2, y: CARD.y + CARD.h / 2 };

export function Panel({ x, y, w, h, opacity = 1, accent, rx = 18 }: { x: number; y: number; w: number; h: number; opacity?: number; accent?: boolean; rx?: number }) {
  return (
    <rect x={x} y={y} width={w} height={h} rx={rx} opacity={opacity} fill="var(--panel)" filter="url(#card-shadow)"
      stroke={accent ? INK.accent : "var(--line-strong)"} strokeOpacity="0.7" strokeWidth="1" />
  );
}

/** The card's surface and the well the task folds into; drawn under the task. */
export function CardBack() {
  const { well } = CARD;
  return (
    <g>
      <Panel x={CARD.x} y={CARD.y} w={CARD.w} h={CARD.h} />
      <rect x={well.x} y={well.y} width={well.w} height={well.h} rx="12" fill="var(--panel-2)" />
    </g>
  );
}

/** Clip for the thumbnail copy of the task, in card coordinates. */
export function WellClip() {
  const { well } = CARD;
  return <clipPath id="card-well"><rect x={well.x} y={well.y} width={well.w} height={well.h} rx="12" /></clipPath>;
}

/** The saved skill, laid out like a task card on the Skills page; drawn over the task. */
export function CardFace() {
  const { well } = CARD;
  const x = well.x + well.w + 20, rowW = CARD.x + CARD.w - 16 - x;
  return (
    <g>
      {["● start", "○ target", "▭ wall"].map((label, i) => (
        <text key={label} x={well.x + 2 + i * 60} y={well.y + well.h + 20} fontSize="11" fill={INK.dim}>{label}</text>
      ))}
      <text x={x} y={84} fontSize="22" fill={INK.text} letterSpacing="-0.01em">Reach past a wall</text>
      <g transform={`translate(${x} 102)`}>
        <rect width={rowW} height="42" rx="12" fill="none" stroke="var(--line)" />
        <path d="M14 21 h16" stroke={ROBOT_DASH.a} strokeWidth="4" strokeLinecap="round" />
        <text x="40" y="26" fontSize="14" fontWeight="500" fill={INK.text}>Robot A</text>
        <text x="105" y="26" fontSize="14" fill="var(--ink-2)">over the top</text>
        <rect x={rowW - 112} y="10" width="100" height="22" rx="11" fill="var(--panel-2)" />
        <text x={rowW - 62} y="25" textAnchor="middle" fontSize="11" fill="var(--ink-2)">learned it itself</text>
      </g>
      <text x={x} y={174} fontSize="13" fill={INK.dim}>Saved to the skill library</text>
    </g>
  );
}

/** A joint-angle tag that gets crossed out and falls away: the card never stores these. */
export function AngleChip({ at, label, strike, drop }: { at: Pt; label: string; strike: number; drop: number }) {
  if (drop >= 1) return null;
  return (
    <g transform={`translate(${at.x} ${at.y + drop * 70}) rotate(${drop * 22})`} opacity={1 - drop}>
      <rect x="-22" y="-13" width="44" height="26" rx="13" fill="var(--panel)" stroke="var(--line-strong)" filter="url(#card-shadow)" />
      <text y="5" textAnchor="middle" fontSize="13" fill={INK.text} className="font-mono">{label}</text>
      <line x1="-15" y1="0" x2={-15 + 30 * strike} y2="0" stroke={INK.bad} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function Tick({ x, y, on }: { x: number; y: number; on: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="10" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
      <circle r={10 * on} fill={INK.good} />
      <path d="M-4.5 0 l3.2 3.2 l5.8 -6.5" stroke="var(--panel)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={on > 0.9 ? 1 : 0} />
    </g>
  );
}

function Verified({ x, y, opacity = 1 }: { x: number; y: number; opacity?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <rect width="176" height="28" rx="14" fill={INK.good} fillOpacity=".1" stroke={INK.good} strokeOpacity=".5" />
      <path d="M12 14 l3.5 3.5 l7 -8" stroke={INK.good} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text x="30" y="18.5" fontSize="13" fill={INK.good}>Simulation-verified</text>
    </g>
  );
}

const CHECKS = ["Hand within 1 cm of target", "Nothing touches the wall", "Joints inside their limits", "Arm comes to rest"];

/** The pass conditions ticking off one by one, then the verdict. `ticks` and `stamp` run 0 to 1. */
export function Checklist({ opacity, ticks, stamp }: { opacity: number; ticks: number[]; stamp: number }) {
  return (
    <g opacity={opacity}>
      <Panel x={28} y={290} w={282} h={228} />
      <text x={50} y={324} fontSize="18" fontWeight="500" fill={INK.text}>Physics check</text>
      {CHECKS.map((c, i) => (
        <g key={c}>
          <Tick x={61} y={355 + i * 32} on={ticks[i]} />
          <text x="82" y={360.5 + i * 32} fontSize="15.5" fill="var(--ink-2)">{c}</text>
        </g>
      ))}
      <Verified x={50} y={472} opacity={stamp} />
    </g>
  );
}

/** A small skill card for the lineage at the end: what the transfer produces. */
export function MiniCard({ x, y, dash, name, sub, opacity = 1, accent }: { x: number; y: number; dash: string; name: string; sub: string; opacity?: number; accent?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <Panel x={0} y={0} w={200} h={66} rx={16} accent={accent} />
      <path d="M18 25 h16" stroke={dash} strokeWidth="4" strokeLinecap="round" />
      <text x="44" y="30.5" fontSize="16" fontWeight="500" fill={INK.text}>{name}</text>
      <text x="18" y="52" fontSize="14" fill="var(--ink-2)">{sub}</text>
    </g>
  );
}
