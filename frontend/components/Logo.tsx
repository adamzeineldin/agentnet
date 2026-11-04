/* Wordmark: the leading n is drawn as a robot arm (its gripper is the dot under the right leg),
   and the dot on the i carries the accent. Units are 1/100 em, so the glyph scales with the font.
   The baseline sits at the bottom of the SVG box; app/icon.svg is the tile version for favicons. */
const X_HEIGHT = 53;
const ARM_WIDTH = 52;

function ArmN() {
  return <svg viewBox={`0 0 ${ARM_WIDTH} ${X_HEIGHT}`} fill="none" aria-hidden="true"
    style={{ width: `${ARM_WIDTH / 100}em`, height: `${X_HEIGHT / 100}em`, marginRight: "0.055em", overflow: "visible" }}>
    <path d="M6.25 46.75V26a19.75 19.75 0 0 1 39.5 0v2" stroke="currentColor" strokeWidth="12.5" strokeLinecap="round" />
    <circle cx="45.75" cy="46" r="7" fill="currentColor" />
  </svg>;
}

/* line-height 1 pins the baseline 0.875em below the box top (Plex ascent 1.025, descent 0.275), so
   top 0.12em centres the dot 0.678em above the baseline, level with Plex's own i dot at any leading. */
function AccentI() {
  return <span className="relative" style={{ lineHeight: 1 }}>ı<span aria-hidden="true" className="absolute left-1/2 rounded-full bg-accent"
    style={{ top: "0.12em", width: "0.155em", height: "0.155em", marginLeft: "-0.0775em" }} /></span>;
}

export function Logo({ className = "" }: { className?: string }) {
  return <span className={`inline-flex items-baseline tracking-[-0.01em] ${className}`}>
    <span aria-hidden="true" className="inline-flex items-baseline"><ArmN /><AccentI />mbotics</span>
    <span className="sr-only">nimbotics</span>
  </span>;
}
