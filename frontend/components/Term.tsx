"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GLOSSARY, type TermId } from "@/lib/glossary";

const TIP_WIDTH = 256;
const EDGE = 8;

/** A word followed by a small "?" that shows its plain-language meaning on hover, focus or tap. */
export function Term({ id, children }: { id: TermId; children?: ReactNode }) {
  const g = GLOSSARY[id];
  const tipId = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(EDGE, r.left - 8), window.innerWidth - TIP_WIDTH - EDGE);
    setPos({ top: r.bottom + 6, left });
  };
  const hide = () => setPos(null);

  // The tip is fixed-positioned (so panels never clip it); it follows its button when the page scrolls or resizes
  // (smooth scrolling keeps firing scroll events just after a click, so closing on scroll would hide it at once).
  const open = pos !== null;
  useEffect(() => {
    if (!open) return;
    const follow = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: Math.min(Math.max(EDGE, r.left - 8), window.innerWidth - TIP_WIDTH - EDGE) });
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  return (
    <span className="inline-flex items-center gap-1" onMouseLeave={hide}>
      {children ?? g.term}
      <button ref={ref} type="button" aria-label={`What does “${g.term}” mean?`} aria-describedby={pos ? tipId : undefined}
        onMouseEnter={show} onFocus={show} onBlur={hide} onClick={show}
        onKeyDown={(e) => { if (e.key === "Escape") hide(); }}
        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[9px] leading-none text-ink-3 hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent">
        ?
      </button>
      {pos && (
        <span role="tooltip" id={tipId} style={{ top: pos.top, left: pos.left, width: TIP_WIDTH }}
          className="fixed z-50 border border-line-strong bg-panel p-2.5 text-left font-sans text-xs font-normal normal-case leading-relaxed tracking-normal text-ink-2 shadow-lg">
          <span className="mb-1 block font-medium text-ink">{g.term}</span>
          {g.meaning}
        </span>
      )}
    </span>
  );
}
