import type { BenchmarkResults, EvalSummary, Variant } from "@/lib/types";
import { subsetName, VARIANT_NAME, VARIANT_PLAIN } from "./names";

const VARIANTS: Variant[] = ["baseline_no_sharing", "retarget_only", "nimbotics_offline"];

/** The headline answer, derived only from the stored summary (comparable layouts). */
function verdict(a: EvalSummary, b: EvalSummary): { title: string; tone: "good" | "warn" | "bad" } {
  const ea = a.median_kinematic_evaluations;
  const eb = b.median_kinematic_evaluations;
  if (a.successes < b.successes) return { title: "Not on this test: sharing solved fewer layouts than starting from scratch.", tone: "bad" };
  if (ea != null && eb != null && ea < eb) return { title: "Yes: with shared experience the robot found a working route with less searching.", tone: "good" };
  if (a.successes > b.successes) return { title: "Yes: sharing solved layouts that starting from scratch could not.", tone: "good" };
  return { title: "No clear difference on this test.", tone: "warn" };
}

function Bar({ label, value, max, text, highlight }: { label: string; value: number; max: number; text: string; highlight: boolean }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-sm">
      <span className={highlight ? "font-medium" : "text-ink-2"}>{label}</span>
      <span className="h-3 overflow-hidden rounded-full bg-panel-2">
        <span className={`block h-full rounded-full ${highlight ? "bg-accent" : "bg-ink-3/50"}`}
          style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, transition: "width .6s var(--ease-out)" }} />
      </span>
      <span className="tabular w-20 text-right text-ink-2">{text}</span>
    </div>
  );
}

/** Answer card + two simple comparisons + what each approach means. */
export function Verdict({ res }: { res: BenchmarkResults }) {
  const s = (v: Variant) => res.summary[v].common;
  const n = s("nimbotics_offline").applicable;
  const v = verdict(s("nimbotics_offline"), s("baseline_no_sharing"));
  const efforts = VARIANTS.map((x) => s(x).median_kinematic_evaluations ?? 0);
  // Kinds of layout where sharing needed more searching than starting from scratch: never hidden behind a "yes".
  const hurt = Object.keys(res.summary.nimbotics_offline).filter((k) => k !== "all" && k !== "common").filter((k) => {
    const a = res.summary.nimbotics_offline[k].median_kinematic_evaluations;
    const b = res.summary.baseline_no_sharing[k].median_kinematic_evaluations;
    return a != null && b != null && a > b;
  });
  return (
    <div className="space-y-4">
      <section aria-label="The answer" className={`soft-card p-6 ${v.tone === "good" ? "border-good/50" : v.tone === "bad" ? "border-bad/50" : "border-warn/50"}`}>
        <p className="eyebrow">The answer, from the latest test</p>
        <p className="mt-2 text-2xl font-light tracking-[-0.02em]">{v.title}</p>
        {hurt.length > 0 && (
          <p className="mt-2 text-sm text-warn">
            Not everywhere: on {hurt.map(subsetName).join(" and ")} layouts it needed more searching than starting from scratch.
          </p>
        )}
        <p className="mt-2 text-sm text-ink-3">
          {n} layouts the robots had never seen; each approach got the same effort budget; every number is a real simulation run.
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Layouts solved" className="soft-card space-y-3 p-5">
          <h2 className="font-medium">Layouts solved <span className="text-xs font-normal text-ink-3">· more is better</span></h2>
          {VARIANTS.map((x) => (
            <Bar key={x} label={VARIANT_NAME[x].replace(" (shared experience)", "")} value={s(x).successes} max={s(x).applicable}
              text={`${s(x).successes} of ${s(x).applicable}`} highlight={x === "nimbotics_offline"} />
          ))}
        </section>
        <section aria-label="Searching needed" className="soft-card space-y-3 p-5">
          <h2 className="font-medium">Routes planned per layout <span className="text-xs font-normal text-ink-3">· fewer is better (median)</span></h2>
          {VARIANTS.map((x, i) => (
            <Bar key={x} label={VARIANT_NAME[x].replace(" (shared experience)", "")} value={efforts[i]} max={Math.max(...efforts)}
              text={s(x).median_kinematic_evaluations == null ? "—" : String(s(x).median_kinematic_evaluations)} highlight={x === "nimbotics_offline"} />
          ))}
        </section>
      </div>
      <dl className="grid gap-3 md:grid-cols-3">
        {VARIANTS.map((x) => (
          <div key={x} className="rounded-xl border border-line p-4">
            <dt className="text-sm font-medium">{VARIANT_NAME[x]}</dt>
            <dd className="mt-1 text-sm text-ink-3">{VARIANT_PLAIN[x]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
