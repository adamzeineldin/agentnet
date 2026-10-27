import type { ReactNode } from "react";
import { apiUrl } from "@/lib/api";
import { fmtM } from "@/lib/format";
import type {
  Adaptation, CandidateSummary, CompatibilityCheck, ExperienceCapsule, ReasoningTrace, RobotPassport, RunEvent, RunRecord,
} from "@/lib/types";
import { EventLog } from "../RunEvidence";
import { ProviderBadge } from "../transfer/ImaginationPanel";
import { RunVideo } from "../transfer/RunMedia";
import { Badge } from "../ui";

export function SceneShell({ index, kicker, title, children }: { index: number; kicker: string; title: string; children: ReactNode }) {
  return (
    <section className="space-y-5">
      <div>
        <div className="text-xs font-medium tracking-[0.2em] text-accent uppercase">Scene {index} · {kicker}</div>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Big({ label, value, tone = "text-ink" }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div>
      <div className="text-[11px] tracking-wide text-ink-3 uppercase">{label}</div>
      <div className={`tabular text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

export function Pending({ busy, events, label }: { busy: boolean; events: RunEvent[]; label: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-line p-6 text-sm text-ink-3">
      <p>{busy ? "Running in MuJoCo…" : label}</p>
      {events.length > 0 && <EventLog events={events} />}
    </div>
  );
}

const candidatesOf = (run: RunRecord) => (run.results.candidates ?? []) as CandidateSummary[];

export function SceneSearch({ run }: { run: RunRecord }) {
  const cands = candidatesOf(run);
  const by = (o: string[]) => cands.filter((c) => o.includes(c.outcome));
  const rejected = by(["collision", "unreachable", "discontinuous_ik", "insufficient_clearance", "physics_failure"]);
  const verified = by(["verified"]);
  const selected = run.results.selected as string | undefined;
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <RunVideo run={run} busy={false} emptyLabel="No execution video" rate={0.5} />
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <Big label="Candidates" value={cands.length} />
          <Big label="Rejected" value={rejected.length} tone="text-bad" />
          <Big label="Verified" value={verified.length} tone="text-good" />
        </div>
        <ul className="space-y-1.5 text-sm">
          {cands.map((c) => (
            <li key={c.candidate_id} className="flex items-center justify-between gap-2">
              <span className="font-mono text-ink-2">{c.candidate_id}</span>
              <Badge tone={c.outcome === "verified" ? "good" : rejected.includes(c) ? "bad" : "accent"}>
                {c.candidate_id === selected ? "★ selected" : c.outcome.replaceAll("_", " ")}
              </Badge>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
          <Big label="Endpoint error" value={fmtM(run.endpoint_error_m, 2)} />
          <Big label="Contacts" value={run.collision_count ?? "—"} />
        </div>
      </div>
    </div>
  );
}

export function SceneCapsule({ capsule, run, onPublish, canPublish }: {
  capsule: ExperienceCapsule | null; run: RunRecord; onPublish?: () => void; canPublish: boolean;
}) {
  if (!capsule) {
    return (
      <div className="space-y-4 rounded-xl border border-line bg-panel p-6">
        <p className="text-ink-2">Verified draft from run <span className="font-mono">{run.run_id}</span> — not yet in the registry.</p>
        {canPublish && onPublish && (
          <button onClick={onPublish} className="rounded-lg border border-good/50 bg-good/10 px-4 py-2 font-medium text-good hover:bg-good/20">
            Publish Experience
          </button>
        )}
      </div>
    );
  }
  const v = capsule.validation;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-good/40 bg-panel p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg">{capsule.skill_id}</span><Badge tone="good">✓ verified in sim</Badge>
        </div>
        <p className="text-ink-2">{capsule.strategy.description}</p>
        <div className="grid grid-cols-3 gap-4">
          <Big label="Strategy" value={<span className="text-lg">{capsule.strategy.route_class.replace("_", " ")} · {fmtM(capsule.strategy.clearance_m, 0)}</span>} />
          <Big label="Endpoint error" value={fmtM(v.endpoint_error_m, 2)} />
          <Big label="Min clearance" value={fmtM(v.min_clearance_m, 1)} />
        </div>
      </div>
      <dl className="grid h-fit grid-cols-[10rem_1fr] gap-x-4 gap-y-2 rounded-xl border border-line bg-panel p-6 text-sm">
        <dt className="text-ink-3">Stored</dt><dd>task-frame waypoints, executed trace, all {capsule.candidate_outcomes.length} candidate outcomes</dd>
        <dt className="text-ink-3">Not stored</dt><dd>joint angles — other robots re-solve their own</dd>
        <dt className="text-ink-3">Source robot</dt><dd className="font-mono">{capsule.source_robot_id}</dd>
        <dt className="text-ink-3">Scene · seed</dt><dd className="font-mono">{capsule.task.scene_id} · {capsule.task.seed}</dd>
        <dt className="text-ink-3">Simulator</dt><dd className="font-mono">{String(capsule.environment.simulator)}</dd>
        <dt className="text-ink-3">Verified by run</dt><dd className="font-mono">{String(capsule.provenance.run_id)}</dd>
      </dl>
    </div>
  );
}

export function ScenePassports({ passports }: { passports: RobotPassport[] }) {
  const ik = (p: RobotPassport) => p.capabilities.find((c) => c.task_type === "position_ik")?.evidence as Record<string, number> | undefined;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {passports.map((p) => (
        <div key={p.robot_id} className="overflow-hidden rounded-xl border border-line bg-panel">
          {/* eslint-disable-next-line @next/next/no-img-element -- MuJoCo render */}
          <img src={apiUrl(`/artifacts/snapshots/${p.robot_id}.png`)} alt={`${p.short_name} home pose`} className="aspect-[2/1] w-full object-cover" />
          <div className="space-y-3 p-5">
            <div className="text-lg font-medium">{p.display_name}</div>
            <div className="grid grid-cols-3 gap-4">
              <Big label="Arm DOF" value={p.dof} />
              <Big label="Sampled reach" value={fmtM(p.workspace.max_reach_m, 0)} />
              <Big label="IK probes" value={ik(p) ? `${ik(p)!.successes}/${ik(p)!.probes}` : "—"} />
            </div>
            <p className="text-xs text-ink-3">
              EE <span className="font-mono">{p.end_effector.site_name}</span> ({p.end_effector.source.replaceAll("_", " ")}) · {p.tool_type}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SceneImagination({ run }: { run: RunRecord }) {
  const cands = candidatesOf(run);
  const trace = run.results.reasoning as ReasoningTrace | undefined;
  const futures = cands.filter((c) => c.physics?.future_index != null)
    .sort((a, b) => (a.physics!.future_index ?? 0) - (b.physics!.future_index ?? 0));
  const screened = cands.filter((c) => c.outcome === "collision" || c.outcome === "insufficient_clearance");
  const top = [...cands].sort((a, b) => (a.prior_rank ?? 99) - (b.prior_rank ?? 99))[0];
  const checks = (run.results.compatibility ?? []) as CompatibilityCheck[];
  const structure = checks.find((c) => c.check === "kinematic_structure");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
        <ProviderBadge trace={trace} />
        {structure && <span>{structure.detail}</span>}
      </div>
      {top && top.outcome !== "verified" && (
        <p className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm text-ink-2">
          Robot A&apos;s strategy <span className="font-mono">{top.candidate_id}</span> was tried first on Robot B&apos;s body:{" "}
          <span className="text-warn">{top.reason}</span>
        </p>
      )}
      <div className="text-sm text-ink-3">{screened.length} hypotheses rejected by kinematic screening · {futures.length} futures simulated in physics</div>
      <ul className="grid gap-4 md:grid-cols-3">
        {futures.map((c) => (
          <li key={c.candidate_id} className={`overflow-hidden rounded-xl border ${c.candidate_id === run.results.selected ? "border-good/60" : "border-line"} bg-panel`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- final MuJoCo state of this future */}
            {c.physics?.thumbnail && <img src={apiUrl(c.physics.thumbnail)} alt={`Future ${c.candidate_id}`} className="aspect-video w-full object-cover" />}
            <div className="flex items-center justify-between p-3 text-sm">
              <span className="font-mono">#{c.physics?.future_index} {c.candidate_id}</span>
              <Badge tone={c.outcome === "verified" ? "good" : "bad"}>
                {c.candidate_id === run.results.selected ? "★ chosen" : c.outcome} · {fmtM(c.physics?.endpoint_error_m, 2)}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SceneAdaptation({ run, capsule, sourceCapsule, onPublish, canPublish }: {
  run: RunRecord; capsule: ExperienceCapsule | null; sourceCapsule: ExperienceCapsule | null;
  onPublish?: () => void; canPublish: boolean;
}) {
  const a = run.results.adaptation as Adaptation | undefined;
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <RunVideo run={run} busy={false} emptyLabel="No execution video" rate={0.5} />
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Big label="Endpoint error" value={fmtM(run.endpoint_error_m, 2)} />
          <Big label="Contacts" value={run.collision_count ?? "—"} />
        </div>
        {a && (
          <p className="text-sm text-ink-2">
            <span className="font-mono">{a.source_strategy}</span> → <span className="font-mono">{String(run.results.selected)}</span>{" "}
            <Badge tone={a.strategy_preserved ? "good" : "warn"}>{a.strategy_preserved ? "strategy preserved" : "strategy adapted"}</Badge>
            <br />UR5e solved its own {a.target_dof}-DOF joint path.
          </p>
        )}
        <div>
          <div className="mb-2 text-[11px] tracking-wide text-ink-3 uppercase">Lineage in the registry</div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
            <span className="rounded-md border border-line px-2 py-1">{sourceCapsule?.skill_id ?? String(run.results.source_skill_id)}<span className="ml-2 text-ink-3">panda_01</span></span>
            <span className="text-accent">→</span>
            {capsule ? (
              <span className="rounded-md border border-good/50 px-2 py-1 text-good">{capsule.skill_id}<span className="ml-2 text-ink-3">ur5e_01</span></span>
            ) : canPublish && onPublish ? (
              <button onClick={onPublish} className="rounded-md border border-good/50 bg-good/10 px-3 py-1 text-good hover:bg-good/20">Publish Adaptation</button>
            ) : (
              <span className="text-ink-3">adaptation not published</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
