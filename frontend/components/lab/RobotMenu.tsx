"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { RobotSummary } from "@/lib/types";
import { Avatar } from "./Avatar";

export interface MenuOption {
  id: string;
  robot: RobotSummary | undefined;
  label: string;
  /** A short tag after the name, e.g. "best match". */
  note?: string;
  /** A quiet second line in the list, e.g. "6 joints · 2.4 s". */
  detail?: string;
}

interface RobotMenuProps {
  /** Names the menu for screen readers ("Robot", "Learn from"). */
  label: string;
  options: MenuOption[];
  value: string;
  disabled?: boolean;
  onPick: (id: string) => void;
  /** Shown under the list, e.g. a link to add a robot. */
  footer?: ReactNode;
}

/** Past this many robots the menu gets a search box. */
const SEARCH_FROM = 7;

/**
 * One robot shown, the rest one click away: a pill that opens a list of robots (searchable once the fleet is large),
 * so the Lab stays one line high however many robots there are.
 */
export function RobotMenu({ label, options, value, disabled, onPick, footer }: RobotMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const current = options.find((o) => o.id === value) ?? options[0];
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => `${o.label} ${o.detail ?? ""}`.toLowerCase().includes(q)) : options;
  const searchable = options.length >= SEARCH_FROM;
  const single = options.length < 2 && !footer;

  useEffect(() => {
    if (!open) return;
    (searchable ? search.current : list.current)?.focus();
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open, searchable]);

  const close = () => {
    setOpen(false);
    setQuery("");
    button.current?.focus();
  };
  const pick = (id: string) => {
    close();
    if (id !== value) onPick(id);
  };
  const toggle = () => {
    setActive(Math.max(0, options.findIndex((o) => o.id === value)));
    setOpen((o) => !o);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length));
    }
    if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      pick(shown[active].id);
    }
  };

  if (!current) return null;
  return (
    // Raised while open, so the list sits above the cards that follow it on the page.
    <div ref={root} className={`relative min-w-0 ${open ? "z-40" : ""}`}>
      <button ref={button} type="button" disabled={disabled || single} onClick={toggle}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={`${label}: ${current.label}`}
        className="flex max-w-full items-center gap-2 rounded-full border border-line-strong bg-panel py-1 pl-1 pr-3 text-sm text-ink transition-colors hover:border-ink-3 disabled:cursor-default disabled:hover:border-line-strong">
        <Avatar robot={current.robot} />
        <span className="truncate">{current.label}</span>
        {current.note && <span className="shrink-0 text-[11px] text-ink-3">{current.note}</span>}
        {!single && <svg aria-hidden="true" viewBox="0 0 12 12" className={`size-3 shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`}><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-panel p-1.5 shadow-[var(--shadow-soft)]">
          {searchable && (
            <input ref={search} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey}
              placeholder="Find a robot" aria-label={`Find a robot (${label})`} aria-controls={listId}
              className="mb-1 w-full rounded-xl border border-line bg-panel-2/60 px-3 py-1.5 text-sm outline-none focus:border-accent" />
          )}
          <ul ref={list} id={listId} role="listbox" aria-label={label} tabIndex={-1} onKeyDown={onKey}
            aria-activedescendant={shown[active] ? `${listId}-${shown[active].id}` : undefined}
            className="max-h-72 overflow-y-auto outline-none">
            {shown.map((o, i) => (
              <li key={o.id} id={`${listId}-${o.id}`} role="option" aria-selected={o.id === value}
                onClick={() => pick(o.id)} onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm ${i === active ? "bg-panel-2" : ""}`}>
                <Avatar robot={o.robot} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}{o.note && <span className="ml-1.5 text-[11px] text-ink-3">{o.note}</span>}</span>
                  {o.detail && <span className="block truncate text-[11px] text-ink-3">{o.detail}</span>}
                </span>
                {o.id === value && <span aria-hidden="true" className="text-xs text-accent">✓</span>}
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-2 text-xs text-ink-3">No robot matches “{query}”.</li>}
          </ul>
          {footer && <div className="mt-1 border-t border-line px-2 pb-0.5 pt-1.5 text-xs">{footer}</div>}
        </div>
      )}
    </div>
  );
}
