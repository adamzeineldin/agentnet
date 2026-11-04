"use client";

import { useRef } from "react";
import { SCENES, local, sceneAt, span } from "./geometry";
import { StoryStage } from "./StoryStage";
import { useScrollProgress } from "./useScrollProgress";

const BEATS = [
  { label: "Learn", line: "Robot A tries routes in simulation until one works." },
  { label: "Remember", line: "It saves the task and what worked. Not its joint angles." },
  { label: "Adapt", line: "Robot B, built differently, solves its own motion." },
  { label: "Prove", line: "Physics decides. Only a pass becomes a new skill." },
];

/** Each beat's caption fades in as its scene starts and out as it ends; the first and last stay put at the ends. */
function captionStyle(p: number, i: number, active: number) {
  if (i !== active) return { opacity: 0, transform: "translateY(10px)" };
  const u = local(p, i);
  const enter = i === 0 ? 1 : span(u, 0, 0.1);
  const leave = i === SCENES - 1 ? 0 : span(u, 0.9, 1);
  return { opacity: enter * (1 - leave), transform: `translateY(${(1 - enter) * 12 - leave * 12}px)` };
}

/** Scroll-pinned walkthrough: a 3D stage, the current beat's caption above the scene, progress below it. */
export function Story() {
  const track = useRef<HTMLDivElement>(null);
  const p = useScrollProgress(track);
  const active = sceneAt(p);

  const jump = (i: number) => {
    const el = track.current;
    if (!el) return;
    const range = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + range * ((i + 0.98) / SCENES), behavior: "smooth" });
  };

  return (
    <div ref={track} className="relative h-[460vh]">
      <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] items-center py-4">
        <div className="relative flex w-full flex-col md:h-full">
          <div aria-hidden="true" className="grid px-5 pt-7 text-center md:pt-10">
            {BEATS.map((b, i) => (
              <div key={b.label} className="[grid-area:1/1] transition-none" style={captionStyle(p, i, active)}>
                <p className="font-mono text-[11px] uppercase tracking-[.14em] text-accent">0{i + 1} · {b.label}</p>
                <p className="mx-auto mt-3 max-w-2xl text-2xl font-light leading-tight tracking-[-0.02em] md:text-4xl">{b.line}</p>
              </div>
            ))}
          </div>
          <div className="aspect-[1000/540] md:aspect-auto md:min-h-0 md:flex-1">
            <StoryStage p={p} />
          </div>
          <ol aria-label="The idea" className="grid grid-cols-4 gap-3 px-5 pb-5 md:gap-6 md:px-8 md:pb-7">
            {BEATS.map((b, i) => {
              const fill = i < active ? 1 : i === active ? local(p, i) : 0;
              return (
                <li key={b.label} aria-current={i === active ? "step" : undefined}>
                  <button type="button" onClick={() => jump(i)}
                    className={`w-full text-left transition-opacity duration-300 ${i === active ? "opacity-100" : "opacity-45 hover:opacity-80"}`}>
                    <span className="block h-[2px] w-full rounded-full bg-line-strong">
                      <span className="block h-full rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" style={{ width: `${fill * 100}%` }} />
                    </span>
                    <span className="mt-2 flex items-baseline gap-2 text-xs md:text-sm">
                      <span className="font-mono text-accent">0{i + 1}</span><span className="hidden md:inline">{b.label}</span>
                    </span>
                    <span className="sr-only">: {b.line}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
