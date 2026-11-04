"use client";

import type { DesignResult } from "@/lib/types";
import { Badge, Disclosure } from "../ui";
import { Scene3D } from "../lab/scene3d/Scene3D";

/** Who designed a task type: Muse (a real, logged call) or the offline templates. */
export function DesignerBadge({ provider, modelId }: { provider: string; modelId?: string | null }) {
  return provider === "meta_muse_spark"
    ? <Badge tone="accent">{`Designed by Meta Muse Spark${modelId ? ` · ${modelId}` : ""}`}</Badge>
    : <Badge>Offline designer · no model call</Badge>;
}

/** A freshly designed task type: what it is, its layout in 3D, and what was checked. */
export function DesignedTask({ result, disabled, onTeach }: {
  result: DesignResult; disabled: boolean; onTeach: (family: string) => void;
}) {
  const { design, example, reused } = result;
  const usage = design.usage;
  return (
    <div className="space-y-3 border-t border-line pt-4 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <DesignerBadge provider={design.provider} modelId={design.model_id} />
        {usage && usage.model_calls > 0 && <span className="text-xs text-ink-3">
          {usage.model_calls} model call{usage.model_calls > 1 ? "s" : ""} · {(usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)} tokens
          {usage.estimated_cost_usd != null && ` · about $${usage.estimated_cost_usd.toFixed(4)}`}</span>}
        {reused && <span className="text-xs text-ink-3">This task already exists, so no duplicate was made.</span>}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-panel p-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">{reused ? "Existing task type" : "New task type"}: {design.title}</p>
          {design.summary && <p className="text-ink-2">{design.summary}</p>}
          {design.limitation && <p className="text-xs text-ink-3">Left out: {design.limitation}</p>}
        </div>
        <button type="button" disabled={disabled} onClick={() => onTeach(design.family)} className="button-primary py-2.5">Use this task</button>
      </div>
      <Scene3D start={example.start} target={example.target} obstacles={example.obstacles} className="max-w-xl"
        label={`${design.title} in 3D: ${example.obstacles.length} obstacle${example.obstacles.length === 1 ? "" : "s"}, the start and the target.`} />
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
