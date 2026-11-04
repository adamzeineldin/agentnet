"use client";

import type { DesignResult } from "@/lib/types";
import { Badge, Disclosure } from "../ui";
import { TaskSketch } from "./TaskSketch";

/** Who designed a task type: Muse (a real, logged call) or the offline templates. */
export function DesignerBadge({ provider, modelId }: { provider: string; modelId?: string | null }) {
  return provider === "meta_muse_spark"
    ? <Badge tone="accent">{`Designed by Meta Muse Spark${modelId ? ` · ${modelId}` : ""}`}</Badge>
    : <Badge>Offline designer · no model call</Badge>;
}

/** A freshly designed task type: what it is, its layout from above and from the side, and what was checked. */
export function DesignedTask({ result, disabled, onTeach }: {
  result: DesignResult; disabled: boolean; onTeach: (family: string) => void;
}) {
  const { design, example, reused } = result;
  const usage = design.usage;
  return (
    <div className="space-y-3 border-t border-line pt-3 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <DesignerBadge provider={design.provider} modelId={design.model_id} />
        {usage && usage.model_calls > 0 && <span className="text-xs text-ink-3">
          {usage.model_calls} model call{usage.model_calls > 1 ? "s" : ""} · {(usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)} tokens
          {usage.estimated_cost_usd != null && ` · about $${usage.estimated_cost_usd.toFixed(4)}`}</span>}
        {reused && <span className="text-xs text-ink-3">Designed before; the saved task type is shown (no new call).</span>}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-panel p-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">New task type: {design.title}</p>
          {design.summary && <p className="text-ink-2">{design.summary}</p>}
          {design.limitation && <p className="text-xs text-ink-3">Left out: {design.limitation}</p>}
        </div>
        <button type="button" disabled={disabled} onClick={() => onTeach(design.family)} className="pill">Teach this task</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <figure>
          <TaskSketch task={example} className="h-24 w-full rounded-lg bg-panel-2/60" />
          <figcaption className="mt-1 text-xs text-ink-3">From above (robot at the bottom)</figcaption>
        </figure>
        <figure>
          <TaskSketch task={example} view="side" className="h-24 w-full rounded-lg bg-panel-2/60" />
          <figcaption className="mt-1 text-xs text-ink-3">From the side (floor at the bottom)</figcaption>
        </figure>
      </div>
      <Disclosure summary="What Nimbotics checked" hint={`${design.checks.length} checks, all passed`}>
        <ul className="list-disc space-y-1 pl-5 text-xs text-ink-2">
          {design.checks.map((c) => <li key={c}>{c}</li>)}
          {design.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </Disclosure>
      <p className="text-xs text-ink-3">
        {design.provider === "meta_muse_spark" ? "Muse designed the layout; " : "The layout is a template; "}
        whether a robot can really do it is decided in the physics simulator when it learns.
        {design.fallback_error && ` Muse could not design it (${design.fallback_error}), so the offline designer did.`}
      </p>
    </div>
  );
}
