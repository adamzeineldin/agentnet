"use client";

import { useState } from "react";
import { useApi } from "@/lib/useApi";
import type { Adaptation, CompatibilityCheck, Health, ReasoningMode, ReasoningTrace } from "@/lib/types";
import type { RunStream } from "@/lib/useRunStream";
import { Badge, Panel } from "../ui";
import { ProviderBadge } from "./ImaginationPanel";
import { RunSummary, RunVideo } from "./RunMedia";

const CHECK_TONE = { pass: "good", warn: "warn", fail: "bad", info: "neutral" } as const;
const CHECK_ICON = { pass: "✓", warn: "!", fail: "✕", info: "i" } as const;

interface TargetPanelProps {
  stream: RunStream;
  sourceSkillId: string | null;
  onTransfer: (sceneSeed: number | null, mode: ReasoningMode) => void;
  onPublish: () => void;
}

export function TargetPanel({ stream, sourceSkillId, onTransfer, onPublish }: TargetPanelProps) {
  const { run, busy, live } = stream;
  const [newScene, setNewScene] = useState(false);
  const [sceneSeed, setSceneSeed] = useState(3);
  const [mode, setMode] = useState<ReasoningMode>("offline");
  const health = useApi<Health>("/api/health");
  const metaAvailable = health.data?.reasoning.mode === "meta_configured";
  const trace = run?.results.reasoning as ReasoningTrace | undefined;
  const checks = (run?.results.compatibility ?? []) as CompatibilityCheck[];
  const adaptation = run?.results.adaptation as Adaptation | undefined;
  const published = run?.results.published === true;

  return (
    <Panel title="Target · Robot B · UR5e" right={
      <button onClick={() => onTransfer(newScene ? sceneSeed : null, mode)} disabled={busy || !sourceSkillId}
        title={sourceSkillId ? undefined : "Publish a source skill first"}
        className="rounded-md border border-accent-dim bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Transferring…" : "Transfer Skill"}
      </button>
    }>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-ink-3">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={!newScene} onChange={() => setNewScene(false)} disabled={busy} /> same scene as source
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={newScene} onChange={() => setNewScene(true)} disabled={busy} /> new scene, seed
          <input type="number" min={0} value={sceneSeed} disabled={busy || !newScene}
            onChange={(e) => setSceneSeed(Math.max(0, Number.parseInt(e.target.value || "0", 10)))}
            className="tabular w-16 rounded-md border border-line bg-panel-2 px-2 py-1 text-ink disabled:opacity-50" />
        </label>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-3">
        reasoning
        <select value={mode} disabled={busy} onChange={(e) => setMode(e.target.value as ReasoningMode)}
          className="rounded-md border border-line bg-panel-2 px-2 py-1 text-ink">
          <option value="offline">Offline deterministic planner</option>
          <option value="meta" disabled={!metaAvailable}>
            Meta Muse Spark{metaAvailable ? "" : " (MODEL_API_KEY not configured)"}
          </option>
        </select>
        {run && <ProviderBadge trace={trace} />}
      </div>
      <RunVideo run={run} busy={busy} emptyLabel={sourceSkillId ? "Not transferred yet" : "Publish a source skill to enable transfer"} />
      {run && (
        <div className="mt-4 space-y-3">
          <RunSummary run={run} live={live} />
          {adaptation && (
            <p className="text-xs text-ink-2">
              Source strategy <span className="font-mono">{adaptation.source_strategy}</span> →{" "}
              <span className="font-mono">{String(run.results.selected)}</span>{" "}
              <Badge tone={adaptation.strategy_preserved ? "good" : "warn"}>
                {adaptation.strategy_preserved ? "strategy preserved" : "strategy adapted"}
              </Badge>{" "}
              (prior rank #{adaptation.prior_rank_of_selected}; UR5e solved its own {adaptation.target_dof}-DOF path)
            </p>
          )}
          {checks.length > 0 && (
            <ul className="space-y-1 text-[11px]">
              {checks.map((c) => (
                <li key={c.check} className="flex gap-2">
                  <Badge tone={CHECK_TONE[c.status]}>{CHECK_ICON[c.status]} {c.check.replaceAll("_", " ")}</Badge>
                  <span className="text-ink-3">{c.detail}</span>
                </li>
              ))}
            </ul>
          )}
          {run.status === "succeeded" && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <button onClick={onPublish} disabled={busy || published}
                className="rounded-md border border-good/50 bg-good/10 px-3 py-1.5 text-sm font-medium text-good hover:bg-good/20 disabled:opacity-60">
                {published ? "✓ Adaptation published" : "Publish Adaptation"}
              </button>
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
