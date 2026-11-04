"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";

const INPUT = "h-12 w-full rounded-full border border-line-strong bg-panel px-5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: ReactNode;
}

/** A labelled, pill-shaped input, as on the sign-in pages. */
export function Field({ id, label, hint, className = "", ...input }: FieldProps) {
  return (
    <div className="space-y-1.5 text-left">
      <label htmlFor={id} className="block text-[14px] font-semibold text-ink">{label}</label>
      <input id={id} {...input} className={`${INPUT} ${className}`} />
      {hint && <p className="px-2 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function Eye({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M4 4l16 16" />}
    </svg>
  );
}

/** A password input with a show / hide button inside it. */
export function PasswordField({ id, label, hint, ...input }: Omit<FieldProps, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-1.5 text-left">
      <label htmlFor={id} className="block text-[14px] font-semibold text-ink">{label}</label>
      <div className="relative">
        <input id={id} type={shown ? "text" : "password"} {...input} className={`${INPUT} pr-12`} />
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown} className="absolute top-1/2 right-3 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:text-ink">
          <Eye open={shown} />
        </button>
      </div>
      {hint && <p className="px-2 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

/** The big black Continue button with its small arrow. */
export function ContinueButton({ busy, label = "Continue", disabled }: { busy: boolean; label?: string; disabled?: boolean }) {
  return (
    <button type="submit" disabled={busy || disabled}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-gradient-to-b from-[#1f2125] to-black text-[15px] font-medium text-white shadow-[0_10px_24px_-12px_rgba(0,0,0,.7)] ring-1 ring-black/60 transition-[transform,opacity] duration-200 hover:-translate-y-px disabled:translate-y-0 disabled:opacity-60">
      {busy ? "One moment…" : label}
      {!busy && <svg viewBox="0 0 10 10" className="size-2.5 text-white/70" fill="currentColor" aria-hidden="true"><path d="M2 1l6 4-6 4z" /></svg>}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-left text-sm text-bad">{message}</p> : null;
}
