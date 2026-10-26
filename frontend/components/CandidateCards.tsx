import { fmtM } from "@/lib/format";
import type { CandidateSummary } from "@/lib/types";
import { outcomeGroup } from "./RouteDiagram";
import { Badge } from "./ui";

const TONE = { verified: "good", feasible: "accent", rejected: "bad" } as const;
const ICON = { verified: "✓", feasible: "◦", rejected: "✕" } as const;

export function CandidateCards({ candidates, selectedId, hoverId, onHover }: {
  candidates: CandidateSummary[]; selectedId?: string | null; hoverId?: string | null; onHover?: (id: string | null) => void;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {candidates.map((c) => {
        const g = outcomeGroup(c.outcome);
        const selected = c.candidate_id === selectedId;
        return (
          <li key={c.candidate_id} onMouseEnter={() => onHover?.(c.candidate_id)} onMouseLeave={() => onHover?.(null)}
            className={`rounded-lg border p-3 text-xs transition-colors ${selected ? "border-good/60 bg-good/5" : hoverId === c.candidate_id ? "border-line-strong bg-panel-2" : "border-line"}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-mono text-ink">{c.candidate_id}</span>
              <span className="flex gap-1">
                {selected && <Badge tone="good">selected</Badge>}
                <Badge tone={TONE[g]}>{ICON[g]} {c.outcome.replaceAll("_", " ")}</Badge>
              </span>
            </div>
            <p className="mb-2 line-clamp-2 text-ink-2" title={c.reason}>{c.reason}</p>
            <dl className="tabular grid grid-cols-3 gap-1 font-mono text-[11px] text-ink-3">
              <div><dt>clearance</dt><dd className="text-ink-2">{c.min_clearance_m == null ? "—" : fmtM(c.min_clearance_m, 1)}</dd></div>
              <div><dt>cost</dt><dd className="text-ink-2">{c.cost == null ? "—" : c.cost.toFixed(3)}</dd></div>
              <div><dt>phys err</dt><dd className="text-ink-2">{c.physics ? fmtM(c.physics.endpoint_error_m, 2) : "—"}</dd></div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
