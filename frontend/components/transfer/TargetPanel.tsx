"use client";

import { useState } from "react";
import { useApi } from "@/lib/useApi";
import type {
  Adaptation, CompatibilityCheck, ControllerExecution, ControllerStatusInfo, ExecuteOn, Health, ReasoningMode,
  ReasoningTrace, RobotSummary,
} from "@/lib/types";
import type { RunStream } from "@/lib/useRunStream";
import { ActButton } from "../auth/SignIn";
import { Term } from "../Term";
import { Badge, Disclosure, Panel } from "../ui";
import { ControllerPanel } from "./ControllerPanel";
import { ProviderBadge } from "./ImaginationPanel";
import { RunSummary, RunVideo } from "./RunMedia";
import { routeName } from "./skillName";

const CHECK_TONE = { pass: "good", warn: "warn", fail: "bad", info: "neutral" } as const;
const CHECK_ICON = { pass: "✓", warn: "!", fail: "✕", info: "i" } as const;

interface TargetPanelProps {
  robot: RobotSummary;
  teacherName: string;
  stream: RunStream;
  sourceSkillId: string | null;
  onTransfer: (sceneSeed: number | null, mode: ReasoningMode, executeOn: ExecuteOn) => void;
  onPublish: () => void;
}

export function TargetPanel({ robot, teacherName, stream, sourceSkillId, onTransfer, onPublish }: TargetPanelProps) {
  const robotName = robot.short_name;
  const { run, busy, live } = stream;
  const [newScene, setNewScene] = useState(false);
  const [sceneSeed, setSceneSeed] = useState(3);
  const [mode, setMode] = useState<ReasoningMode>("offline");
  const [onUrsim, setOnUrsim] = useState(false);
  const health = useApi<Health>("/api/health");
  const ursim = useApi<ControllerStatusInfo>("/api/controller/status");
  const hasUrsim = robot.controller === "ursim";
  const ursimReady = hasUrsim && ursim.data?.ready === true;
  const metaAvailable = health.data?.reasoning.mode === "meta_configured";
  const trace = run?.results.reasoning as ReasoningTrace | undefined;
  const checks = (run?.results.compatibility ?? []) as CompatibilityCheck[];
  const adaptation = run?.results.adaptation as Adaptation | undefined;
  const published = run?.results.published === true;
  const controllerExecution = run?.results.controller_execution as ControllerExecution | undefined;

  return (
    <Panel title={<><span className="text-accent">2</span> · {robotName} adapts it</>} right={
      <ActButton onClick={() => onTransfer(newScene ? sceneSeed : null, mode, onUrsim && ursimReady ? "ursim" : "none")} disabled={busy || !sourceSkillId}
        title={sourceSkillId ? undefined : `Publish a ${teacherName} skill first`}
        className="button-primary disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Transferring…" : "Transfer Skill"}
      </ActButton>
    }>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-ink-3">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={!newScene} onChange={() => setNewScene(false)} disabled={busy} /> same layout as the teacher
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={newScene} onChange={() => setNewScene(true)} disabled={busy} /> a new layout, <Term id="seed">seed</Term>
          <input type="number" min={0} value={sceneSeed} disabled={busy || !newScene}
            onChange={(e) => setSceneSeed(Math.max(0, Number.parseInt(e.target.value || "0", 10)))}
            className="tabular w-16 border border-line bg-panel-2 px-2 py-1 text-ink disabled:opacity-50" />
        </label>
      </div>
      <div className="mb-3">
        <Disclosure summary="More options" hint={`ranking: ${mode === "meta" ? "Muse Spark" : "offline"}`}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
              <Term id="routeRanking">route ranking</Term>
              <select value={mode} disabled={busy} onChange={(e) => setMode(e.target.value as ReasoningMode)}
                className="border border-line bg-panel-2 px-2 py-1 text-ink">
                <option value="offline">Offline deterministic planner</option>
                <option value="meta" disabled={!metaAvailable}>
                  Meta Muse Spark{metaAvailable ? "" : " (MODEL_API_KEY not configured)"}
                </option>
              </select>
              {run && <ProviderBadge trace={trace} />}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-ink-3" title={ursim.data?.detail}>
              <input type="checkbox" aria-label="Also run on the URSim controller (not physical)"
                checked={onUrsim && ursimReady} disabled={busy || !ursimReady}
                onChange={(e) => setOnUrsim(e.target.checked)} />
              also run on the <Term id="ursim">URSim</Term> controller (not physical)
              {!ursimReady && <span className="text-ink-3">· {!hasUrsim ? `not available for ${robotName}` : ursim.data?.configured ? "not ready" : "not configured"}</span>}
            </label>
          </div>
        </Disclosure>
      </div>
      <RunVideo run={run} busy={busy} emptyLabel={sourceSkillId ? "Not transferred yet" : `Publish a ${teacherName} skill first`} />
      {run && (
        <div className="mt-4 space-y-3">
          <RunSummary run={run} live={live} />
          {adaptation && (
            <p className="text-sm text-ink-2" title={`${adaptation.source_strategy} → ${String(run.results.selected)}`}>
              <Badge tone={adaptation.strategy_preserved ? "good" : "warn"}>
                {adaptation.strategy_preserved ? "strategy preserved" : "strategy adapted"}
              </Badge>{" "}
              {adaptation.strategy_preserved
                ? `Same route as the ${teacherName} (${routeName(adaptation.source_strategy.split("@")[0]).toLowerCase()}), `
                : `The ${teacherName} went ${routeName(adaptation.source_strategy.split("@")[0]).toLowerCase()}; the ${robotName} went ${routeName(String(run.results.selected).split("@")[0]).toLowerCase()} instead, `}
              with its own {adaptation.target_dof}-joint motion.
            </p>
          )}
          {checks.length > 0 && (
            <Disclosure summary="Can this arm do it? Pre-checks" hint={`${checks.filter((c) => c.status === "pass").length} of ${checks.length} passed`}>
            <ul className="space-y-1 text-[11px]">
              {checks.map((c) => (
                <li key={c.check} className="flex gap-2">
                  <Badge tone={CHECK_TONE[c.status]}>{CHECK_ICON[c.status]} {c.check.replaceAll("_", " ")}</Badge>
                  <span className="text-ink-3">{c.detail}</span>
                </li>
              ))}
            </ul>
            </Disclosure>
          )}
          {controllerExecution && <ControllerPanel execution={controllerExecution} />}
          {run.status === "succeeded" && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <ActButton onClick={onPublish} disabled={busy || published}
                className="pill border-good/50 bg-good/10 font-medium text-good hover:bg-good/20 disabled:opacity-60">
                {published ? "✓ Adaptation published" : "Publish Adaptation"}
              </ActButton>
              <span className="font-mono text-[11px] text-ink-3">
                {String(run.results.source_skill_id)} → {run.skill_id}
              </span>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
