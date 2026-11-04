"use client";

import { type RefObject, useEffect, useState } from "react";

/** How far the page has scrolled through `track` while its sticky child is pinned, eased toward the target. */
export function useScrollProgress(track: RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let shown = 0, frame = 0;
    const target = () => {
      const r = el.getBoundingClientRect();
      const range = r.height - window.innerHeight;
      return range > 0 ? Math.min(1, Math.max(0, -r.top / range)) : 0;
    };
    const tick = () => {
      const goal = target();
      shown = reduced.matches || Math.abs(goal - shown) < 0.0005 ? goal : shown + (goal - shown) * 0.18;
      setProgress(shown);
      frame = shown === goal ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => { if (!frame) frame = requestAnimationFrame(tick); };
    wake();
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
    };
  }, [track]);
  return progress;
}
