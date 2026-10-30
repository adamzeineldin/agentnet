import type { ReactNode } from "react";
import type { Provenance, RunStatus } from "@/lib/types";

export function Panel({ title, right, children, className = "" }: {
  title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`min-w-0 border border-line bg-panel ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="min-w-0 break-words text-sm font-medium text-ink">{title}</h2>
          {right}
        </header>
      )}
      <div className="min-w-0 overflow-x-auto p-4">{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "text-ink-3",
  accent: "text-accent",
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
} as const;

export function Badge({ tone = "neutral", children, title }: {
  tone?: keyof typeof TONES; children: ReactNode; title?: string;
}) {
  return (
    <span title={title} className={`inline-flex max-w-full items-center gap-1.5 font-mono text-[11px] ${TONES[tone]}`}>
      <span aria-hidden="true" className="size-[5px] shrink-0 rounded-full bg-current" />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

const PROV_LABEL: Record<Provenance, string> = {
  model: "from model", measured: "measured", declared: "declared",
};
const PROV_TITLE: Record<Provenance, string> = {
  model: "Read directly from the compiled MuJoCo model",
  measured: "Computed by sampling or simulating the model",
  declared: "Written in AgentNet's catalog; not derivable from the model",
};

export function ProvenanceTag({ p }: { p: Provenance }) {
  const tone = p === "declared" ? "warn" : p === "measured" ? "accent" : "neutral";
  return <Badge tone={tone} title={PROV_TITLE[p]}>{PROV_LABEL[p]}</Badge>;
}

export function StatusBadge({ status }: { status: RunStatus }) {
  const tone = status === "succeeded" ? "good" : status === "failed" ? "bad" : status === "queued" ? "neutral" : "accent";
  return <Badge tone={tone}>{status}</Badge>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="stat-value tabular break-words text-[28px] leading-tight font-light text-ink">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="border border-bad/40 bg-panel px-3 py-2 text-sm text-bad">
      {message}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="animate-pulse text-sm text-ink-3">{label}</div>;
}

export type EvidenceKind = "real" | "sim" | "controller" | "model";

const EVIDENCE: Record<EvidenceKind, { label: string; title: string; className: string }> = {
  real: { label: "real robot recording", title: "Recorded on physical robot hardware by a public dataset (not by AgentNet)",
    className: "border-good/50 text-good" },
  sim: { label: "MuJoCo simulation", title: "Computed by AgentNet in the MuJoCo physics simulator",
    className: "border-accent/50 text-accent" },
  controller: { label: "URSim controller software", title: "Universal Robots controller software on an idealized arm; not a physical robot",
    className: "border-warn/50 text-warn" },
  model: { label: "model-written", title: "Text written by Meta Muse Spark; never a measurement",
    className: "border-line-strong text-ink-3" },
};

/** Says where a piece of evidence came from. Used everywhere real data, simulation and controller results meet. */
export function EvidenceTag({ kind }: { kind: EvidenceKind }) {
  const e = EVIDENCE[kind];
  return <span title={e.title} className={`inline-flex shrink-0 items-center border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${e.className}`}>{e.label}</span>;
}
