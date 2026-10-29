import { apiUrl } from "@/lib/api";
import { fmtM } from "@/lib/format";
import type { CandidateSummary, ReasoningTrace, RunRecord } from "@/lib/types";
import { Badge, Panel } from "../ui";

export function ProviderBadge({ trace }: { trace: ReasoningTrace | undefined }) {
  if (!trace) return null;
  if (trace.provider_used === "meta_muse_spark") return <Badge tone="accent">Meta Muse Spark · {trace.model_id}</Badge>;
  if (trace.fallback_error) return <Badge tone="warn" title={trace.fallback_error}>Offline planner (Meta call failed)</Badge>;
  return <Badge tone="warn">Offline deterministic planner</Badge>;
}

/** Candidate futures simulated in MuJoCo before committing, plus the reasoning trace that ordered them. */
export function ImaginationPanel({ run }: { run: RunRecord }) {
  const trace = run.results.reasoning as ReasoningTrace | undefined;
  const candidates = (run.results.candidates ?? []) as CandidateSummary[];
  const futures = candidates.filter((c) => c.physics?.future_index != null)
    .sort((a, b) => (a.physics!.future_index ?? 0) - (b.physics!.future_index ?? 0));
  const selected = run.results.selected as string | undefined;
  if (!trace || futures.length === 0) return null;

  return (
    <Panel title="Collective Imagination · predicted futures" right={<ProviderBadge trace={trace} />}>
      <p className="mb-3 text-xs text-ink-3">
        Each future is a full MuJoCo rollout from the same start state (fresh reset), simulated in the provider&apos;s
        ranked order within a physics budget of {trace.physics_budget}. The first verified future is executed.
      </p>
      <ul className="grid gap-3 sm:grid-cols-3">
        {futures.map((c) => {
          const ok = c.outcome === "verified";
          return (
            <li key={c.candidate_id} className={`overflow-hidden  border ${c.candidate_id === selected ? "border-good/60" : "border-line"}`}>
              {c.physics?.thumbnail && (
                /* eslint-disable-next-line @next/next/no-img-element -- final MuJoCo state of this future */
                <img src={apiUrl(c.physics.thumbnail)} alt={`Simulated final state for ${c.candidate_id}`} className="aspect-video w-full object-cover" />
              )}
              <div className="space-y-1 p-2 text-[11px]">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-ink">#{c.physics?.future_index} {c.candidate_id}</span>
                  {c.candidate_id === selected ? <Badge tone="good">executed</Badge>
                    : <Badge tone={ok ? "good" : "bad"}>{ok ? "✓ verified" : "✕ " + c.outcome.replaceAll("_", " ")}</Badge>}
                </div>
                <div className="tabular font-mono text-ink-3">
                  err {fmtM(c.physics?.endpoint_error_m, 2)} · contacts {c.physics?.collisions.length ?? 0}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] tracking-wide text-ink-3 uppercase">Reasoning trace</div>
          <ol className="space-y-2">
            {trace.proposals.map((p, i) => (
              <li key={i} className="border border-line p-2">
                <div className="mb-1 flex flex-wrap gap-1.5">
                  <Badge>{p.kind}</Badge><Badge>{p.provider ?? "—"}</Badge>
                  {p.error && <Badge tone="bad">{p.error}</Badge>}
                </div>
                <div className="font-mono text-[11px] text-ink-2">{p.ranking.slice(0, 5).join(" › ")}{p.ranking.length > 5 ? " › …" : ""}</div>
                {p.rationale && <p className="mt-1 text-ink-3">{p.rationale}</p>}
                {p.calls?.map((c, j) => (
                  <div key={j} className="tabular font-mono text-[10px] text-ink-3">
                    {c.summary}{c.prompt_tokens != null ? ` · ${c.prompt_tokens}+${c.completion_tokens} tok` : ""}{c.latency_s ? ` · ${c.latency_s.toFixed(2)} s` : ""}
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </div>
        <dl className="grid h-fit grid-cols-[11rem_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-ink-3">Provider used</dt><dd className="font-mono">{trace.provider_used}</dd>
          <dt className="text-ink-3">Model calls</dt><dd className="font-mono">{trace.model_calls}</dd>
          <dt className="text-ink-3">Tokens (in / out)</dt><dd className="font-mono">{trace.prompt_tokens ?? "—"} / {trace.completion_tokens ?? "—"}</dd>
          <dt className="text-ink-3">Estimated cost</dt><dd className="font-mono">{trace.estimated_cost_usd == null ? "—" : `$${trace.estimated_cost_usd.toFixed(5)}`}</dd>
          <dt className="text-ink-3">Revisions</dt><dd className="font-mono">{trace.revisions}</dd>
          <dt className="text-ink-3">Offline would select</dt><dd className="font-mono">{trace.offline_expected_selection ?? "—"} <span className="text-ink-3">({trace.comparison_basis.replace("_", " ")})</span></dd>
          <dt className="text-ink-3">Model changed selection</dt>
          <dd>{trace.provider_used === "meta_muse_spark"
            ? <Badge tone={trace.changed_selection_vs_offline ? "accent" : "neutral"}>{trace.changed_selection_vs_offline ? "yes" : "no — same as offline"}</Badge>
            : <span className="text-ink-3">n/a (no model used)</span>}</dd>
        </dl>
      </div>
    </Panel>
  );
}
