"use client";

import { useApi } from "@/lib/useApi";
import type { ControllerStatusInfo, ExecuteOn, Health, ReasoningMode, RobotSummary } from "@/lib/types";
import { Term } from "../Term";
import { Disclosure } from "../ui";
import { ExactLayout } from "../transfer/ExactLayout";

export interface AdaptChoice {
  mode: ReasoningMode;
  executeOn: ExecuteOn;
}

/** Advanced choices for adapting a skill: who orders the routes, and whether URSim also runs the result. */
export function AdaptOptions({ robot, value, disabled, onChange }: {
  robot: RobotSummary; value: AdaptChoice; disabled: boolean; onChange: (v: AdaptChoice) => void;
}) {
  const health = useApi<Health>("/api/health");
  const ursim = useApi<ControllerStatusInfo>("/api/controller/status");
  const hasUrsim = robot.controller === "ursim";
  const ursimReady = hasUrsim && ursim.data?.ready === true;
  const metaAvailable = health.data?.reasoning.mode === "meta_configured";
  return (
    <Disclosure summary="More options" hint={`route order: ${value.mode === "meta" ? "Muse Spark" : "fixed rule"}`}>
      <div className="space-y-3 text-sm">
        <label className="flex flex-wrap items-center gap-2">
          <Term id="routeRanking">Who picks the route order</Term>
          <select value={value.mode} disabled={disabled} onChange={(e) => onChange({ ...value, mode: e.target.value as ReasoningMode })}
            className="min-w-0 max-w-full border border-line-strong bg-panel px-2 py-1 text-ink">
            <option value="offline">A fixed rule (no AI)</option>
            <option value="meta" disabled={!metaAvailable}>Meta Muse Spark{metaAvailable ? "" : " (not switched on here)"}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-ink-2" title={ursim.data?.detail}>
          <input type="checkbox" aria-label="Also run on the URSim controller (not physical)"
            checked={value.executeOn === "ursim" && ursimReady} disabled={disabled || !ursimReady}
            onChange={(e) => onChange({ ...value, executeOn: e.target.checked ? "ursim" : "none" })} />
          also run it on Universal Robots&apos; <Term id="ursim">URSim</Term> controller (not physical)
          {!ursimReady && <span className="text-ink-3">· {!hasUrsim ? "UR5e only" : ursim.data?.configured ? "not ready" : "not configured"}</span>}
        </label>
      </div>
    </Disclosure>
  );
}

/** Advanced choice for learning directly: repeat one exact layout instead of a new one. */
export function LearnOptions({ layout, disabled, onChange }: {
  layout: number | null; disabled: boolean; onChange: (v: number | null) => void;
}) {
  return <ExactLayout value={layout} onChange={onChange} disabled={disabled} />;
}
