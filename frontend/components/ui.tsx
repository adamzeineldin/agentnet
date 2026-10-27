import type { ReactNode } from "react";
import type { Provenance, RunStatus } from "@/lib/types";

export function Panel({ title, right, children, className = "" }: {
  title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-panel/80 ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="text-[13px] font-medium tracking-wide text-ink-2 uppercase">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "border-line-strong text-ink-2 bg-panel-2",
  accent: "border-accent-dim/60 text-accent bg-accent/10",
  good: "border-good/40 text-good bg-good/10",
  warn: "border-warn/40 text-warn bg-warn/10",
  bad: "border-bad/40 text-bad bg-bad/10",
} as const;

export function Badge({ tone = "neutral", children, title }: {
  tone?: keyof typeof TONES; children: ReactNode; title?: string;
}) {
  return (
    <span title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>
      {children}
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
  if (status === "succeeded") return <Badge tone="good">✓ succeeded</Badge>;
  if (status === "failed") return <Badge tone="bad">✕ failed</Badge>;
  return <Badge tone="accent"><span className="size-1.5 animate-pulse rounded-full bg-accent" />{status}</Badge>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] tracking-wide text-ink-3 uppercase">{label}</div>
      <div className="tabular truncate text-lg font-medium text-ink">{value}</div>
      {hint && <div className="truncate text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
      {message}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="animate-pulse text-sm text-ink-3">{label}</div>;
}
