"use client";

import { useState, type ReactNode } from "react";

/** Shows a long list a page at a time, with one button for the next page; the library never renders thousands at once. */
export function Paged<T>({ items, page, className, list = false, render }: {
  items: T[]; page: number; className: string;
  /** Render a <ul> (items are <li>) rather than a <div>. */
  list?: boolean;
  render: (item: T) => ReactNode;
}) {
  const [shown, setShown] = useState(page);
  const rest = items.length - shown;
  return (
    <div className="space-y-4">
      {list
        ? <ul className={className}>{items.slice(0, shown).map(render)}</ul>
        : <div className={className}>{items.slice(0, shown).map(render)}</div>}
      {rest > 0 && (
        <div className="text-center">
          <button type="button" onClick={() => setShown((n) => n + page)} className="pill text-xs">
            Show {Math.min(rest, page)} more <span className="text-ink-3">of {rest}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** A list cut to its first few entries with a toggle for the rest; for robots on a skill page. */
export function Collapsed<T>({ items, limit, noun, listItem = false, render }: {
  items: T[]; limit: number; noun: string;
  /** Inside a <ul>: the toggle gets its own <li>. */
  listItem?: boolean;
  render: (item: T) => ReactNode;
}) {
  const [all, setAll] = useState(false);
  const hidden = items.length - limit;
  const toggle = hidden > 0 && (
    <button type="button" onClick={() => setAll((a) => !a)} className="px-1 text-xs text-accent hover:underline">
      {all ? "Show fewer" : `Show ${hidden} more ${noun}`}
    </button>
  );
  return (
    <>
      {(all ? items : items.slice(0, limit)).map(render)}
      {toggle && (listItem ? <li className="px-3 py-2">{toggle}</li> : toggle)}
    </>
  );
}
