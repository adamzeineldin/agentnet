"use client";

import { useId, useState, type KeyboardEvent } from "react";

/** A robot or task type the typed text matches; picking it turns it into a filter. */
export interface Suggestion {
  kind: "robot" | "task";
  id: string;
  label: string;
  hint: string;
}

/** An active filter shown inside the search bar. */
export interface Token {
  key: string;
  label: string;
  onRemove: () => void;
}

interface SearchBoxProps {
  value: string;
  placeholder: string;
  tokens: Token[];
  /** Robots and task types matching the text, best first. */
  suggest: (text: string) => Suggestion[];
  onPick: (s: Suggestion) => void;
  onChange: (q: string) => void;
}

const KIND_LABEL: Record<Suggestion["kind"], string> = { robot: "Robot", task: "Task type" };

/**
 * The library's one filter control. Typing searches; matching robots and task types are offered underneath and become
 * removable tokens when picked, so it works the same with three robots or three thousand.
 */
export function SearchBox({ value, placeholder, tokens, suggest, onPick, onChange }: SearchBoxProps) {
  const listId = useId();
  // Local text so typing never waits for the URL; only an outside clear (value emptied) resets it.
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value === "") setText("");
  }
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const options = text.trim() ? suggest(text.trim()) : [];
  const open = focused && options.length > 0;

  const type = (next: string) => {
    setText(next);
    setActive(0);
    onChange(next);
  };
  const pick = (s: Suggestion) => {
    onPick(s);
    setText("");
    setActive(0);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && open) { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
    else if (e.key === "ArrowUp" && open) { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); }
    else if (e.key === "Enter" && open) { e.preventDefault(); pick(options[active]); }
    else if (e.key === "Escape") setFocused(false);
    else if (e.key === "Backspace" && !text && tokens.length) tokens[tokens.length - 1].onRemove();
  };

  return (
    // z-20: the suggestion list must sit over the tab row below, which animates in as its own layer.
    <div className="relative z-20">
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-[14px] border border-line-strong bg-panel py-1.5 pl-4 pr-2 shadow-[var(--shadow-soft)] focus-within:border-accent">
        <span aria-hidden="true" className="text-lg text-ink-3">⌕</span>
        {tokens.map((t) => (
          <span key={t.key} className="inline-flex items-center gap-1 rounded-full bg-ink py-1 pl-3 pr-1.5 text-xs text-bg">
            {t.label}
            <button type="button" onClick={t.onRemove} aria-label={`Remove filter ${t.label}`} className="rounded-full px-1 opacity-70 hover:opacity-100">✕</button>
          </span>
        ))}
        <input type="search" role="combobox" aria-label="Search the library" aria-expanded={open} aria-controls={listId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined} autoComplete="off"
          value={text} placeholder={tokens.length ? "" : placeholder} maxLength={80}
          onChange={(e) => type(e.target.value)} onKeyDown={onKey}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className="min-w-[10rem] flex-1 border-0! bg-transparent py-1.5 text-base text-ink shadow-none outline-none!" />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label="Filter by"
          className="absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden rounded-[14px] border border-line bg-panel py-1 shadow-[var(--shadow-soft)]">
          {options.map((s, i) => (
            <li key={`${s.kind}:${s.id}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => { e.preventDefault(); pick(s); }} onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${i === active ? "bg-panel-2" : ""}`}>
              <span className="w-16 shrink-0 text-[11px] text-ink-3">{KIND_LABEL[s.kind]}</span>
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="shrink-0 text-xs text-ink-3">{s.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
