"use client";

import { useState } from "react";
import { designTask } from "@/lib/api";
import type { DesignResult, ScoutPlan } from "@/lib/types";
import { ActButton } from "../auth/SignIn";
import { DesignedTask } from "../transfer/DesignedTask";
import { Badge, ErrorNote } from "../ui";

interface MuseSuggestionProps {
  plan: ScoutPlan;
  disabled: boolean;
  onUse: (family: string) => void;
  /** A task type was designed (or an existing one found): reload the task list, then use it. */
  onDesigned: (family: string) => void;
}

export function ProviderBadge({ plan }: { plan: Pick<ScoutPlan, "provider" | "model_id"> }) {
  return plan.provider === "meta_muse_spark"
    ? <Badge tone="accent">{`Meta Muse Spark · ${plan.model_id}`}</Badge>
    : <Badge>Offline scout · no model call</Badge>;
}

/** Who answered: Muse only when a real model call was made, otherwise the offline scout. */
const lead = (who: string, match: ScoutPlan["match"]) => ({
  confident: `${who} thinks you mean`,
  unsure: `${who} isn't sure. Closest match`,
  none: `${who} found no task type that fits`,
})[match];

/**
 * What Muse made of a description: an existing task type to confirm, close alternatives, and a question when it is not
 * sure. Designing a new task type is the last option, offered only once the user says none of these fit.
 */
export function MuseSuggestion({ plan, disabled, onUse, onDesigned }: MuseSuggestionProps) {
  const [designed, setDesigned] = useState<DesignResult | null>(null);
  const [designing, setDesigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sure = plan.match === "confident";
  const muse = plan.provider === "meta_muse_spark";
  const who = muse ? "Muse" : "The offline scout";

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

  return (
    <section aria-label="Suggested task type" aria-live="polite" className="soft-card space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">For &ldquo;{plan.goal}&rdquo;</p>
        <ProviderBadge plan={plan} />
      </div>
      {plan.match !== "none" && (
        <div className="space-y-1">
          <p className="text-sm text-ink-3">{lead(who, plan.match)}</p>
          <p className="text-xl font-light tracking-[-0.01em]">{plan.task_title}</p>
          {plan.task_why && <p className="text-sm text-ink-2">{plan.task_why}</p>}
        </div>
      )}
      {plan.match === "none" && <p className="text-base">{lead(who, "none")}.</p>}
      {plan.question && <p className="rounded-xl bg-panel-2/70 px-3.5 py-2.5 text-sm">{plan.question}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {plan.match !== "none" && (
          <button type="button" disabled={disabled} onClick={() => onUse(plan.task_family)}
            className={sure ? "button-primary py-2.5" : "pill"}>{sure ? "Yes, use this task" : plan.task_title}</button>
        )}
        {plan.alternatives.map((a) => (
          <button key={a.task_family} type="button" disabled={disabled} onClick={() => onUse(a.task_family)} className="pill">
            {sure ? `Or: ${a.task_title}` : a.task_title}
          </button>
        ))}
      </div>
      {/* Nothing fits: designing is the main action (still one click the user makes, never automatic). */}
      {!designed && plan.match === "none" && (
        <div className="space-y-2">
          <ActButton disabled={designing || disabled} onClick={() => void design()} className="button-primary py-2.5 disabled:opacity-50">
            {designing ? "Designing a new task…" : "Design a new task for this"}
          </ActButton>
          <p className="text-xs text-ink-3">
            {plan.question ? "Or answer the question above and ask again." : "Or add detail and ask again."}
          </p>
        </div>
      )}
      {!designed && plan.match !== "none" && (
        <p className="text-xs text-ink-3">
          {sure ? "Not what you meant? Add detail and ask again, or " : "Add detail and ask again, or "}
          <ActButton disabled={designing || disabled} onClick={() => void design()} className="text-accent hover:underline disabled:opacity-50">
            {designing ? "Designing a new task…" : "none of these fit: design a new task"}
          </ActButton>.
        </p>
      )}
      {error && <ErrorNote message={error} />}
      {designed && <DesignedTask result={designed} disabled={disabled} onTeach={onDesigned} />}
      {plan.fallback_error && <p className="text-xs text-ink-3">Muse could not answer ({plan.fallback_error}), so the offline scout did.</p>}
    </section>
  );
}
