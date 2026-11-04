import type { ReactNode } from "react";

export type StepState = "locked" | "active" | "done";

interface StepCardProps {
  n: number;
  title: string;
  state: StepState;
  lockedNote?: string;
  children: ReactNode;
}

/** One numbered step of the Lab's teach flow. Locked steps say what to do first. */
export function StepCard({ n, title, state, lockedNote, children }: StepCardProps) {
  return (
    <section aria-labelledby={`step-${n}-h`} aria-disabled={state === "locked" || undefined}
      className={`soft-card p-5 transition-opacity md:p-6 ${state === "locked" ? "opacity-55" : ""}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full font-mono text-sm ${
          state === "done" ? "bg-good text-bg" : state === "active" ? "bg-accent text-bg" : "bg-panel-2 text-ink-3"}`}>
          {state === "done" ? "✓" : n}
        </span>
        <h2 id={`step-${n}-h`} className="text-lg font-normal tracking-[-0.01em]">{title}</h2>
      </div>
      <div className="mt-4 md:pl-11">
        {state === "locked" ? <p className="text-sm text-ink-3">{lockedNote}</p> : children}
      </div>
    </section>
  );
}
