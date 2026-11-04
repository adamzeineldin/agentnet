"use client";

import { useState } from "react";
import { ApiError, changeVisibility } from "@/lib/api";
import type { SharedKind, Visibility, VisibilityPlan } from "@/lib/types";
import { ErrorNote } from "../ui";

/** A small "Private" marker for lists: only the owner ever sees private work, so it always means "only you". */
export function PrivateBadge() {
  return (
    <span title="Only you can see this" className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] font-normal text-ink-2">
      Private
    </span>
  );
}

interface VisibilityControlProps {
  kind: SharedKind;
  id: string;
  visibility: Visibility;
  /** Called with the new visibility once the change (and everything it carried along) is saved. */
  onChanged?: (visibility: Visibility) => void;
}

const NOUN: Record<SharedKind, string> = { run: "run", skill: "skill", robot: "robot" };

function isPlan(detail: unknown): detail is VisibilityPlan {
  return typeof detail === "object" && detail !== null && Array.isArray((detail as VisibilityPlan).also);
}

/**
 * Who sees one of your items, and the button that changes it. When other items must change too (a skill's run, a
 * private robot it ran on, your skills built on it), the list is shown and nothing changes until you confirm.
 */
export function VisibilityControl({ kind, id, visibility, onChanged }: VisibilityControlProps) {
  const [current, setCurrent] = useState(visibility);
  const [pending, setPending] = useState<VisibilityPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target: Visibility = current === "private" ? "public" : "private";

  async function change(confirm: boolean) {
    setBusy(true);
    setError(null);
    try {
      const done = await changeVisibility(kind, id, target, confirm);
      setCurrent(done.visibility);
      setPending(null);
      onChanged?.(done.visibility);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409 && isPlan(e.detail)) setPending(e.detail);
      else setError(e instanceof Error ? e.message.replace(/^\d+: /, "") : "Could not change who sees this");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-panel-2 px-2.5 py-1 text-ink-2">
          {current === "private" ? "Private · only you" : "Public · in everyone's Library"}
        </span>
        {!pending && (
          <button type="button" onClick={() => void change(false)} disabled={busy} className="pill text-xs">
            {busy ? "Saving…" : target === "public" ? `Make this ${NOUN[kind]} public` : "Make it private"}
          </button>
        )}
      </div>
      {pending && (
        <div role="alertdialog" aria-label="Confirm the change" className="space-y-2 rounded-xl bg-panel-2/60 p-3 text-sm">
          <p>{target === "public" ? "Making this public also makes public:" : "Making this private also hides:"}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-ink-2">
            {pending.also.map((item) => <li key={`${item.kind}:${item.id}`}>{item.label}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void change(true)} disabled={busy} className="button-primary text-xs">
              {busy ? "Saving…" : target === "public" ? "Make them all public" : "Make them all private"}
            </button>
            <button type="button" onClick={() => setPending(null)} disabled={busy} className="pill text-xs">Cancel</button>
          </div>
        </div>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  );
}
