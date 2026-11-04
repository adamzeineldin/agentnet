import { fmtM, fmtMetres, fmtSec } from "@/lib/format";
import type { SkillMetrics } from "@/lib/types";

/** Plain-words labels for the measures the librarian compares; every value comes from a stored capsule. */
const MEASURES: { key: keyof SkillMetrics; label: string; fmt: (v: number) => string; meaning: string }[] = [
  { key: "execution_s", label: "Execution time", fmt: fmtSec, meaning: "Simulated time the verified motion took in MuJoCo." },
  { key: "path_length_m", label: "Hand path", fmt: fmtMetres,
    meaning: "Length of the path the hand really took, from the recorded trace." },
  { key: "endpoint_error_m", label: "Off target", fmt: (v) => fmtM(v, 1), meaning: "How far the hand ended from the target." },
  { key: "min_clearance_m", label: "Closest to obstacle", fmt: (v) => fmtM(v, 0), meaning: "Smallest gap between the arm and any obstacle." },
];

/** One verified motion, measured: the numbers the improvement verdict compares. */
export function Metrics({ m }: { m: SkillMetrics }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {MEASURES.map(({ key, label, fmt, meaning }) => (
        <div key={key} title={meaning} className="min-w-0 rounded-xl bg-panel-2/60 px-3.5 py-2.5">
          <dt className="text-[11px] text-ink-3">{label}</dt>
          <dd className="tabular mt-0.5 text-lg font-light tracking-[-0.02em]">{fmt(m[key] as number)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Existing vs new motion side by side, as the verdict judged them. */
export function Comparison({ existing, candidate }: { existing: SkillMetrics; candidate: SkillMetrics }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] text-ink-3">
          <th className="py-1 pr-3 font-normal" scope="col">Measure</th>
          <th className="py-1 pr-3 font-normal" scope="col">Existing</th>
          <th className="py-1 font-normal" scope="col">New attempt</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {MEASURES.map(({ key, label, fmt }) => (
          <tr key={key} className="border-t border-line">
            <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-2">{label}</th>
            <td className="py-1.5 pr-3">{fmt(existing[key] as number)}</td>
            <td className="py-1.5">{fmt(candidate[key] as number)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
