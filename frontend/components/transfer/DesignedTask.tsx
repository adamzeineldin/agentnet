"use client";

import type { DesignResult } from "@/lib/types";
import { Disclosure } from "../ui";
import { Scene3D } from "../lab/scene3d/Scene3D";

/** A freshly designed task type (or the existing one it matched): its layout in 3D, one button, and what was checked. */
export function DesignedTask({ result, disabled, onTeach }: {
  result: DesignResult; disabled: boolean; onTeach: (family: string) => void;
}) {
  const { design, example, reused } = result;
  const offline = design.provider !== "meta_muse_spark";
  return (
    <div className="space-y-4 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-3">
            {reused ? "Already in the library, so no duplicate was made" : "New task type"}{offline && " · offline template"}
          </p>
          <p className="text-lg tracking-[-0.01em]" title={design.summary || undefined}>{design.title}</p>
        </div>
        <button type="button" disabled={disabled} onClick={() => onTeach(design.family)} className="button-primary py-2">Use this task</button>
      </div>
      <Scene3D start={example.start} target={example.target} obstacles={example.obstacles} className="max-w-xl"
        label={`${design.title} in 3D: ${example.obstacles.length} obstacle${example.obstacles.length === 1 ? "" : "s"}, the start and the target.`} />
      <Disclosure summary="What was checked" hint={`${design.checks.length} checks, all passed`}>
        <ul className="list-disc space-y-1 pl-5 text-xs text-ink-2">
          {design.checks.map((c) => <li key={c}>{c}</li>)}
          {design.limitation && <li>Left out: {design.limitation}</li>}
          <li>Whether a robot can do it is decided in the physics simulator when it learns.</li>
        </ul>
      </Disclosure>
    </div>
  );
}
