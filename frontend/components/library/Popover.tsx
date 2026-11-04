"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface PopoverProps {
  /** Names the panel for screen readers ("Filters", "Sort"). */
  label: string;
  /** What the button shows; the button's accessible name is `buttonLabel` when given, else this text. */
  button: ReactNode;
  buttonLabel?: string;
  /** Marks the button as holding a non-default choice. */
  active?: boolean;
  /** The panel's edge that lines up with the button. */
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}

/** A quiet pill that opens a small panel below it; a click outside or Escape closes it and returns focus. */
export function Popover({ label, button, buttonLabel, active, align = "left", children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const button = trigger.current;
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
      // Back to the button on close; a click elsewhere then moves focus on to what was clicked.
      button?.focus();
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    // Raised while open, so the panel sits above the list that follows it.
    <div ref={root} className={`relative ${open ? "z-40" : ""}`}>
      <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-label={buttonLabel}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
          active || open ? "border-ink-3 bg-panel text-ink" : "border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink"}`}>
        {button}
        <svg aria-hidden="true" viewBox="0 0 12 12" className={`size-3 shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label={label}
          className={`menu-pop absolute top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-panel p-1.5 shadow-[var(--shadow-soft)] ${
            align === "right" ? "right-0" : "left-0"}`}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

/** A vertical list of mutually exclusive choices inside a panel, the chosen one ticked. */
export function RadioList<T extends string>({ label, options, value, onPick }: {
  label: string; options: [T, string][]; value: T; onPick: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onPick(v)}
          className={`flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-panel-2 ${
            value === v ? "text-ink" : "text-ink-2"}`}>
          {text}
          {value === v && <span aria-hidden="true" className="text-xs text-accent">✓</span>}
        </button>
      ))}
    </div>
  );
}
