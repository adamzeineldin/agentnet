"use client";

import Link from "next/link";
import { useState } from "react";
import { createLibraryReport } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { Health, LibrarianMode, LibraryReport } from "@/lib/types";
import { ActButton } from "../auth/SignIn";
import { Badge, ErrorNote, Loading, Panel, Stat } from "../ui";
import { Collections, Duplicates, Gaps, ModelText, Suggestions } from "./ReportSections";

interface LibrarianPanelProps {
  onOpenSkill: (skillId: string) => void;
}

function ProviderBadge({ report }: { report: LibraryReport }) {
  if (report.provider === "meta_muse_spark") return <Badge tone="accent">Meta Muse Spark · {report.model_id}</Badge>;
  if (report.fallback_error) return <Badge tone="warn" title={report.fallback_error}>Offline rules (Muse call failed)</Badge>;
  return <Badge tone="warn">Offline rules · no model</Badge>;
}

function Usage({ report }: { report: LibraryReport }) {
  const u = report.usage;
  if (!u) return null;
  return (
    <span className="font-mono text-[11px] text-ink-3">
      {u.model_calls} model call{u.model_calls === 1 ? "" : "s"} · {u.prompt_tokens ?? "—"} / {u.completion_tokens ?? "—"} tokens ·{" "}
      {u.estimated_cost_usd == null ? "cost —" : `$${u.estimated_cost_usd.toFixed(5)}`}
    </span>
  );
}

function ReportView({ report, onOpenSkill }: { report: LibraryReport; onOpenSkill: (id: string) => void }) {
  const duplicateCount = report.duplicates.reduce((n, d) => n + d.duplicate_skill_ids.length, 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <ProviderBadge report={report} />
        <span>{fmtDateTime(report.created_at)}</span>
        <span className="font-mono text-[11px]">{report.report_id}</span>
        <Usage report={report} />
      </div>
      <div className="metric-grid grid grid-cols-2 sm:grid-cols-4">
        <Stat label="Published skills" value={report.skill_count} />
        <Stat label="Distinct" value={report.skill_count - duplicateCount} hint="after grouping duplicates" />
        <Stat label="Duplicates" value={duplicateCount} />
        <Stat label="Coverage gaps" value={report.gaps.length} />
      </div>
      {report.summary && <ModelText>{report.summary}</ModelText>}
      <Suggestions report={report} />
      <Collections items={report.collections} onOpen={onOpenSkill} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Duplicates items={report.duplicates} onOpen={onOpenSkill} />
        <Gaps items={report.gaps} />
      </div>
      <ul className="space-y-1 text-[11px] text-ink-3">{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}

/** Organizes the published registry into a stored Library Report. Never edits, merges or deletes skills. */
export function LibrarianPanel({ onOpenSkill }: LibrarianPanelProps) {
  const latest = useApi<LibraryReport>("/api/library/reports/latest");
  const health = useApi<Health>("/api/health");
  const metaAvailable = health.data?.reasoning.mode === "meta_configured";
  const [mode, setMode] = useState<LibrarianMode>("offline");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<LibraryReport | null>(null);
  const noReport = latest.error?.startsWith("404") ?? false;
  const report = created ?? latest.data;

  async function organize() {
    setBusy(true);
    setError(null);
    try {
      setCreated(await createLibraryReport(mode));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not organize the library");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel title="Librarian" right={
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <select aria-label="Librarian" value={mode} disabled={busy} onChange={(e) => setMode(e.target.value as LibrarianMode)}
            className="border border-line bg-panel-2 px-2 py-1 text-ink">
            <option value="offline">Offline rules (free)</option>
            <option value="meta" disabled={!metaAvailable}>
              Meta Muse Spark{metaAvailable ? " (~$0.001, adds summary & priorities)" : " (MODEL_API_KEY not configured)"}
            </option>
          </select>
          <ActButton onClick={organize} disabled={busy} className="button-primary disabled:opacity-50">
            {busy ? "Organizing…" : "Organize library"}
          </ActButton>
        </div>
      }>
        <div className="grid gap-4 text-sm text-ink-2 md:grid-cols-3">
          <p><span className="font-medium text-ink">What it does.</span> Sorts the saved skills into groups, spots
            near-duplicates, notices which arm has never learned a kind of route, and suggests which skill to teach to
            which arm next.</p>
          <p><span className="font-medium text-ink">What it never does.</span> It does not move any robot, run any
            test, or change or delete a skill. It only writes a report; you decide what to run.</p>
          <p><span className="font-medium text-ink">Where Muse fits.</span> The groups and suggestions always come
            from fixed rules. With Meta Muse Spark switched on, the model adds a written summary and reorders the
            suggestions. <Link href="/under-the-hood#muse" className="text-accent hover:underline">More →</Link></p>
        </div>
      </Panel>
      {error && <ErrorNote message={error} />}
      {latest.loading && !created && <Loading />}
      {latest.error && !noReport && !created && <ErrorNote message={latest.error} />}
      {noReport && !created && (
        <p className="soft-card p-8 text-sm text-ink-3">No library report yet. Press “Organize library”.</p>
      )}
      {report && <ReportView report={report} onOpenSkill={onOpenSkill} />}
    </div>
  );
}
