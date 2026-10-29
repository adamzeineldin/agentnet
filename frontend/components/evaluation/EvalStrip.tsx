"use client";

import { useState } from "react";
import type { EvalRow, Variant } from "@/lib/types";

const W = 640;
const ROW_H = 76;
const STEP = 8;
const PER_ROW = 5;
const LEFT = 150;
const RIGHT = 20;

/** Per-scene kinematic evaluations for each variant; ✓/✕ by outcome. One axis, one dot per scene. */
export function EvalStrip({ rows, variants }: { rows: EvalRow[]; variants: Variant[] }) {
  const [hover, setHover] = useState<EvalRow | null>(null);
  const maximum = Math.max(1, ...rows.map((r) => r.kinematic_evaluations));
  const ticks = Array.from(new Set(Array.from({ length: 6 }, (_, i) => Math.round(maximum * i / 5))));
  const H = variants.length * ROW_H + 40;
  // Deterministic stacking: marks sharing a value stack away from the row centre (✓ up, ✕ down).
  const place = (vr: EvalRow[]) => {
    const seen = new Map<string, number>();
    return vr.map((r) => {
      const key = `${r.kinematic_evaluations}-${r.success}`;
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      const dx = ((k % PER_ROW) - (PER_ROW - 1) / 2) * 7;
      return { r, dx, dy: (r.success ? -1 : 1) * (6 + Math.floor(k / PER_ROW) * STEP) };
    });
  };
  const sx = (v: number) => LEFT + (v / maximum) * (W - LEFT - RIGHT);
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label="Kinematic evaluations needed per held-out scene, per variant">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={sx(t)} x2={sx(t)} y1={8} y2={H - 24} stroke="var(--line)" />
            <text x={sx(t)} y={H - 8} textAnchor="middle" className="text-[10px]" fill="var(--ink-3)">{t}</text>
          </g>
        ))}
        {variants.map((v, i) => {
          const y = 8 + i * ROW_H + ROW_H / 2;
          const vr = rows.filter((r) => r.variant === v && r.applicable);
          return (
            <g key={v}>
              <text x={LEFT - 10} y={y + 4} textAnchor="end" className="text-[11px]" fill="var(--ink-2)">{v}</text>
              <line x1={LEFT} x2={W - RIGHT} y1={y} y2={y} stroke="var(--line)" strokeDasharray="2 4" />
              {place(vr).map(({ r, dx, dy }) => {
                const cy = y + dy;
                const cx = sx(r.kinematic_evaluations) + dx;
                return r.success ? (
                  <circle key={r.scene_id} cx={cx} cy={cy} r={hover === r ? 5 : 3.5} fill="var(--good)" fillOpacity={0.85}
                    stroke="var(--panel)" strokeWidth={2} onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)} />
                ) : (
                  <g key={r.scene_id} onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)}>
                    <rect x={cx - 6} y={cy - 4} width={12} height={8} fill="transparent" />
                    <path d={`M${cx - 3},${cy - 3}L${cx + 3},${cy + 3}M${cx + 3},${cy - 3}L${cx - 3},${cy + 3}`}
                      stroke="var(--bad)" strokeWidth={2} strokeLinecap="round" />
                  </g>
                );
              })}
            </g>
          );
        })}
        <text x={LEFT - 10} y={H - 8} textAnchor="end" className="text-[10px]" fill="var(--ink-3)">kinematic evaluations →</text>
      </svg>
      {hover && (
        <div className="tabular pointer-events-none absolute top-0 right-0 border border-line bg-panel-2 px-2 py-1 font-mono text-[11px] text-ink-2">
          {hover.scene_id} · {hover.variant} · {hover.success ? `✓ ${hover.selected}` : "✕ no verified candidate"} · {hover.kinematic_evaluations} evals
        </div>
      )}
      <figcaption className="mt-1 flex flex-wrap gap-4 text-[11px] text-ink-3">
        <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full bg-good" />✓ verified</span>
        <span className="flex items-center gap-1"><span className="text-bad">✕</span> failed (all candidates or budget spent)</span>
        <span>One mark per applicable held-out scene; marks with the same value cluster around it (✓ above the line, ✕ below). Lower is less search effort.</span>
      </figcaption>
    </figure>
  );
}
