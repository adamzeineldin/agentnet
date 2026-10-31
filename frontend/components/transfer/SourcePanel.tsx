"use client";

import type { ExperienceCapsule } from "@/lib/types";
import type { RunStream } from "@/lib/useRunStream";
import { Term } from "../Term";
import { Badge, Panel } from "../ui";
import { RunSummary, RunVideo } from "./RunMedia";

interface SourcePanelProps {
  robotName: string;
  stream: RunStream;
  skills: ExperienceCapsule[];
  selectedSkillId: string | null;
  onSelectSkill: (id: string) => void;
  seed: number;
  onSeed: (s: number) => void;
  onDiscover: () => void;
  onPublish: () => void;
}

export function SourcePanel({ robotName, stream, skills, selectedSkillId, onSelectSkill, seed, onSeed, onDiscover, onPublish }: SourcePanelProps) {
  const { run, busy, live } = stream;
  const published = run?.results.published === true;
  return (
    <Panel title={`Source · ${robotName}`} right={
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-ink-3"><Term id="seed">seed</Term>
          <input type="number" min={0} value={seed} disabled={busy}
            onChange={(e) => onSeed(Math.max(0, Number.parseInt(e.target.value || "0", 10)))}
            className="tabular w-16 border border-line bg-panel-2 px-2 py-1 text-ink" />
        </label>
        <button onClick={onDiscover} disabled={busy}
          className="button-primary disabled:cursor-wait disabled:opacity-50">
          {busy ? "Discovering…" : "Discover Skill"}
        </button>
      </div>
    }>
      <label className="mb-3 flex items-center gap-2 text-xs text-ink-3">
        Published skill
        <select value={selectedSkillId ?? ""} onChange={(e) => onSelectSkill(e.target.value)} disabled={busy || skills.length === 0}
          className="min-w-0 flex-1 border border-line bg-panel-2 px-2 py-1 font-mono text-ink">
          {skills.length === 0 && <option value="">none published yet</option>}
          {skills.map((s) => (
            <option key={s.skill_id} value={s.skill_id}>
              {s.skill_id} · {s.strategy.route_class}@{s.strategy.clearance_m.toFixed(2)} · {s.task.scene_id}
            </option>
          ))}
        </select>
      </label>
      <RunVideo run={run} busy={busy} emptyLabel="No discovery run yet" />
      {run && (
        <div className="mt-4 space-y-3">
          <RunSummary run={run} live={live} />
          {run.status === "succeeded" && (
            <div className="flex items-center gap-3 border-t border-line pt-3">
              <button onClick={onPublish} disabled={busy || published}
                className="border border-good/50 bg-good/10 px-3 py-1.5 text-sm font-medium text-good hover:bg-good/20 disabled:opacity-60">
                {published ? "✓ Published" : "Publish Experience"}
              </button>
              <span className="font-mono text-[11px] text-ink-3">{run.skill_id}</span>
              {!published && <Badge tone="warn">draft — not in registry</Badge>}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
