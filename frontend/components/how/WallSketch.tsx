/** Schematic of the reach-past-a-wall task: a side view (straight vs over) and a top view (near and far side). */

type Anchor = "start" | "middle" | "end";

function Label({ x, y, children, anchor = "middle" }: { x: number; y: number; children: string; anchor?: Anchor }) {
  return <text x={x} y={y} textAnchor={anchor} className="fill-ink-3 font-mono" fontSize="11">{children}</text>;
}

const START_X = 70;
const TARGET_X = 290;
const SVG = "w-full border border-line bg-panel-2";

/** Start and target dots; labels go below them (side view) or beside them (top view), clear of the routes. */
function Points({ y, beside }: { y: number; beside?: boolean }) {
  const dy = beside ? 4 : 22;
  return (
    <>
      <circle cx={START_X} cy={y} r="5" className="fill-ink" />
      <Label x={beside ? START_X - 10 : START_X} y={y + dy} anchor={beside ? "end" : "middle"}>start</Label>
      <circle cx={TARGET_X} cy={y} r="5" className="fill-accent" />
      <Label x={beside ? TARGET_X + 10 : TARGET_X} y={y + dy} anchor={beside ? "start" : "middle"}>target</Label>
    </>
  );
}

export function WallSketch() {
  return (
    <figure className="m-0">
      <div className="grid gap-4 sm:grid-cols-2">
        <svg viewBox="0 0 360 200" role="img" aria-label="Side view: the straight line hits the wall; the route over the wall clears it" className={SVG}>
          <Label x={14} y={22} anchor="start">SIDE VIEW</Label>
          <line x1="14" y1="180" x2="346" y2="180" className="stroke-line-strong" />
          <rect x="168" y="85" width="24" height="95" className="fill-panel stroke-line-strong" />
          <Label x={198} y={112} anchor="start">wall</Label>
          <line x1={START_X} y1="140" x2="168" y2="140" className="stroke-bad" strokeDasharray="4 3" strokeWidth="1.5" />
          <path d="M174 134 l12 12 M186 134 l-12 12" className="stroke-bad" strokeWidth="2" />
          <path d={`M${START_X} 140 C 100 40, 260 40, ${TARGET_X} 140`} fill="none" className="stroke-good" strokeWidth="2" />
          <Label x={180} y={56}>over</Label>
          <Points y={140} />
        </svg>
        <svg viewBox="0 0 360 200" role="img" aria-label="Top view: routes go around the near side or the far side of the wall" className={SVG}>
          <Label x={14} y={22} anchor="start">TOP VIEW</Label>
          <rect x="168" y="62" width="24" height="76" className="fill-panel stroke-line-strong" />
          <path d={`M${START_X} 100 C 100 10, 260 10, ${TARGET_X} 100`} fill="none" className="stroke-good" strokeWidth="2" />
          <Label x={180} y={26}>far side</Label>
          <path d={`M${START_X} 100 C 100 190, 260 190, ${TARGET_X} 100`} fill="none" className="stroke-good" strokeWidth="2" />
          <Label x={180} y={190}>near side (closer to the robot)</Label>
          <Points y={100} beside />
        </svg>
      </div>
      <figcaption className="mt-2 text-[11px] text-ink-3">
        Sketch, not to scale. Red: the straight line hits the wall. Green: the three ways around it.
      </figcaption>
    </figure>
  );
}
