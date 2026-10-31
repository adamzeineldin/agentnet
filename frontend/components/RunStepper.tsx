import type { RunEvent, RunStatus } from "@/lib/types";

const DISCOVER: RunStatus[] = ["queued", "profiling", "proposing", "checking", "simulating", "selecting", "executing", "verifying", "succeeded"];
const TRANSFER: RunStatus[] = ["queued", "retrieving", "profiling", "checking", "proposing", "simulating", "selecting", "executing", "verifying", "succeeded"];

export function RunStepper({ events, kind = "discover" }: { events: RunEvent[]; kind?: "discover" | "transfer" }) {
  const STEPS = kind === "transfer" ? TRANSFER : DISCOVER;
  const seen = new Set(events.map((e) => e.status));
  const last = events.at(-1)?.status;
  const failed = last === "failed";
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px]">
      {STEPS.map((s, i) => {
        const done = seen.has(s) && s !== last;
        const current = s === last;
        const tone = current
          ? s === "succeeded" ? "border-good/50 text-good bg-good/10" : "border-accent-dim text-accent bg-accent/10"
          : done ? "border-line-strong text-ink-2" : "border-line text-ink-3/60";
        return (
          <li key={s} className="flex items-center gap-1">
            <span className={`rounded-full border px-2.5 py-0.5 transition-colors ${tone}`}>{done ? "✓ " : ""}{s}</span>
            {i < STEPS.length - 1 && <span className="text-ink-3/50">›</span>}
          </li>
        );
      })}
      {failed && <li><span className="rounded-full border border-bad/50 bg-bad/10 px-2.5 py-0.5 text-bad">✕ failed</span></li>}
    </ol>
  );
}
