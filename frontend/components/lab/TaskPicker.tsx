"use client";

import { useState } from "react";
import { scoutPlan } from "@/lib/api";
import type { Health, ScoutPlan } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { ActButton } from "../auth/SignIn";
import { ErrorNote } from "../ui";
import { MuseSuggestion } from "./MuseSuggestion";

const EXAMPLES = ["Put a cup on a high shelf", "Reach under a low beam", "Reach through a narrow gap"];

interface TaskPickerProps {
  robotId: string;
  robotName: string;
  disabled: boolean;
  onPick: (family: string) => void;
  onDesigned: (family: string) => void;
}

/**
 * What the robot should do: describe it, and Muse matches it to a task type the library already has.
 * Muse's match is a suggestion the user confirms; nothing is designed or learned until they choose.
 */
export function TaskPicker({ robotId, robotName, disabled, onPick, onDesigned }: TaskPickerProps) {
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<ScoutPlan | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = goal.trim().length >= 3 && !asking && !disabled;
  // Muse is named only when this server can call it; otherwise the offline scout answers (and says so).
  const muse = useApi<Health>("/api/health").data?.reasoning.mode === "meta_configured";

  async function ask() {
    setAsking(true);
    setError(null);
    try {
      setPlan(await scoutPlan(goal.trim(), robotId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  }
  const use = (f: string) => {
    setPlan(null);
    onPick(f);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); if (ready) void ask(); }}
        className="flex min-h-12 flex-wrap items-center gap-2 rounded-[14px] border border-line-strong bg-panel py-1.5 pl-4 pr-1.5 shadow-[var(--shadow-soft)] focus-within:border-accent">
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">Describe the task</span>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={300} disabled={asking || disabled}
            placeholder={`Describe a task for the ${robotName}, e.g. “put a cup on a high shelf”`}
            className="w-full border-0! bg-transparent py-1.5 text-base text-ink shadow-none outline-none!" />
        </label>
        <ActButton type="submit" disabled={!ready} className="button-primary rounded-[10px] px-4 py-2 disabled:opacity-40">
          {asking ? "Reading the library…" : muse ? "Ask Muse" : "Find a match"}
        </ActButton>
      </form>
      {!plan && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          <span className="mr-1">Try</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" disabled={asking || disabled} onClick={() => setGoal(ex)}
              className="rounded-full px-2.5 py-1 text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink">{ex}</button>
          ))}
        </p>
      )}
      {error && <ErrorNote message={error} />}
      {plan && <MuseSuggestion key={plan.created_at} plan={plan} disabled={disabled} onUse={use}
        onDesigned={(f) => { setPlan(null); onDesigned(f); }} />}
    </div>
  );
}
