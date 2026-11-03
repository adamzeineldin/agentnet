"use client";

import { Term } from "../Term";
import { Disclosure } from "../ui";

interface ExactLayoutProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled: boolean;
}

/** Advanced: repeat one exact layout instead of a new random one each time. */
export function ExactLayout({ value, onChange, disabled }: ExactLayoutProps) {
  return (
    <Disclosure summary="Repeat an exact layout (advanced)" hint={value === null ? "off: a new layout each time" : `layout ${value}`}>
      <div className="space-y-2 text-sm text-ink-2">
        <p className="max-w-2xl">
          Every task type can be built in thousands of layouts: different obstacle sizes and start and target points.
          A <Term id="seed">layout number</Term> picks one, and the same number always builds the same layout. Use it to repeat a run exactly,
          or to test two robots on the very same layout.
        </p>
        <label className="flex flex-wrap items-center gap-2">
          <input type="checkbox" checked={value !== null} disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? 42 : null)} aria-label="Use an exact layout number" />
          Use layout number
          <input type="number" min={0} value={value ?? 42} disabled={disabled || value === null} aria-label="Layout number"
            onChange={(e) => onChange(Math.max(0, Number.parseInt(e.target.value || "0", 10)))}
            className="tabular w-24 border border-line-strong bg-panel px-2 py-1 text-ink disabled:opacity-50" />
        </label>
      </div>
    </Disclosure>
  );
}
