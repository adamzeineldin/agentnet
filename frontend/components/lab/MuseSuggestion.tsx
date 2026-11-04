"use client";

import { useState } from "react";
import { designTask } from "@/lib/api";
import type { DesignResult, ScoutPlan } from "@/lib/types";
import { ActButton } from "../auth/SignIn";
import { DesignedTask } from "../transfer/DesignedTask";
import { ErrorNote } from "../ui";

interface MuseSuggestionProps {
  plan: ScoutPlan;
  disabled: boolean;
  onUse: (family: string) => void;
  /** Answer Muse's question: the answer is added to the description and the library is searched again. */
  onRefine: (answer: string) => void;
  /** A task type was designed (or an existing one found): reload the task list, then use it. */
  onDesigned: (family: string) => void;
  onDismiss: () => void;
}

/** Answering the question searches again with the answer added; nothing is chosen for the user. */
function Question({ text, disabled, onRefine }: { text: string; disabled: boolean; onRefine: (answer: string) => void }) {
  const [answer, setAnswer] = useState("");
  const ready = answer.trim().length > 0 && !disabled;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ready) onRefine(answer.trim()); }} className="space-y-2 rounded-xl bg-panel-2/60 p-3">
      <label htmlFor="scout-answer" className="block text-sm text-ink-2">{text}</label>
      <div className="flex gap-2">
        <input id="scout-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={200} disabled={disabled}
          placeholder="Your answer" className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm outline-none focus:border-accent" />
        <button type="submit" disabled={!ready} className="rounded-lg px-3 text-sm text-accent hover:bg-panel disabled:opacity-40">Search again</button>
      </div>
    </form>
  );
}

/**
 * The closest task type the library already has for a description, to confirm in one click. Close alternatives and
 * a question sit underneath; designing a new task type is offered last, or first when nothing fits.
 */
export function MuseSuggestion({ plan, disabled, onUse, onRefine, onDesigned, onDismiss }: MuseSuggestionProps) {
  const [designed, setDesigned] = useState<DesignResult | null>(null);
  const [designing, setDesigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const none = plan.match === "none";
  // The offline keyword scout is labelled; a real Muse answer needs no label.
  const offline = plan.provider !== "meta_muse_spark";

  async function design() {
    setDesigning(true);
    setError(null);
    try {
      setDesigned(await designTask(plan.goal));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDesigning(false);
    }
  }
  const designButton = (primary: boolean) => (
    <ActButton disabled={designing || disabled} onClick={() => void design()}
      className={primary ? "button-primary py-2 disabled:opacity-50" : "text-accent hover:underline disabled:opacity-50"}>
      {designing ? "Designing…" : "Design a new task"}
    </ActButton>
  );

  return (
    <section aria-label="Suggested task type" aria-live="polite" className="soft-card space-y-4 p-4 md:p-5">
      {designed ? (
        <DesignedTask result={designed} disabled={disabled} onTeach={onDesigned} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-ink-3">
                {none ? "No close match" : plan.match === "confident" ? "Best match" : "Closest match"}
                {offline && " · offline"}
              </p>
              <p className="text-lg tracking-[-0.01em]" title={plan.task_why || undefined}>
                {none ? "This looks like a new task." : plan.task_title}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {none ? designButton(true) : (
                <button type="button" disabled={disabled} onClick={() => onUse(plan.task_family)} className="button-primary py-2">Use this task</button>
              )}
              <button type="button" onClick={onDismiss} aria-label="Dismiss the suggestion"
                className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-panel-2 hover:text-ink">×</button>
            </div>
          </div>
          {plan.alternatives.length > 0 && (
            <div role="group" aria-label="Other task types" className="flex flex-wrap items-center gap-1 text-sm">
              <span className="mr-1 text-xs text-ink-3">{none ? "Closest" : "Or"}</span>
              {plan.alternatives.map((a) => (
                <button key={a.task_family} type="button" disabled={disabled} onClick={() => onUse(a.task_family)}
                  className="rounded-full px-3 py-1 text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink">{a.task_title}</button>
              ))}
            </div>
          )}
          {plan.question && <Question text={plan.question} disabled={disabled} onRefine={onRefine} />}
          {!none && <p className="text-xs text-ink-3">None of these? {designButton(false)}</p>}
        </>
      )}
      {error && <ErrorNote message={error} />}
    </section>
  );
}
