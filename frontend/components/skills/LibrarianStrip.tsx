"use client";

import Link from "next/link";
import { useState } from "react";
import { createLibraryReport } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { ExperienceCapsule, Health, LibrarianMode, LibraryReport } from "@/lib/types";
import { ActButton } from "../auth/SignIn";
import { ModelText } from "../library/ModelText";
import { taskTitle } from "./grouping";
import { Badge, ErrorNote } from "../ui";

interface LibrarianStripProps {
  skills: ExperienceCapsule[];
  robotName: (id: string) => string;
}

/** The librarian's latest advice in plain words: what to teach next. It never runs anything or edits a skill. */
export function LibrarianStrip({ skills, robotName }: LibrarianStripProps) {
  const latest = useApi<LibraryReport>("/api/library/reports/latest");
  const health = useApi<Health>("/api/health");
  const [created, setCreated] = useState<LibraryReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<LibrarianMode>("offline");
  const report = created ?? latest.data;
  const metaAvailable = health.data?.reasoning.mode === "meta_configured";
  const byId = new Map(skills.map((s) => [s.skill_id, s]));

  async function organize() {
    setBusy(true);
    setError(null);
    try {
      setCreated(await createLibraryReport(mode));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The librarian could not run");
    } finally {
      setBusy(false);
    }
  }

  const tips = (report?.suggestions ?? []).slice(0, 3);
  return (
    <section aria-label="Librarian" className="soft-card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-medium">Librarian: what to teach next</h2>
          <p className="text-sm text-ink-3">
            Reads everything saved here and suggests which robot should learn which task next. It never runs anything or
            changes a skill.
          </p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <select aria-label="Librarian" value={mode} disabled={busy} onChange={(e) => setMode(e.target.value as LibrarianMode)}
            className="min-w-0 max-w-full border border-line-strong bg-panel px-2 py-1.5 text-xs text-ink">
            <option value="offline">Fixed rules (free)</option>
            <option value="meta" disabled={!metaAvailable}>
              Meta Muse Spark{metaAvailable ? " (adds a summary)" : " (MODEL_API_KEY not configured)"}
            </option>
          </select>
          <ActButton onClick={organize} disabled={busy} className="button-primary py-2 disabled:opacity-50">
            {busy ? "Thinking…" : "Organize library"}
          </ActButton>
        </div>
      </div>
      {error && <ErrorNote message={error} />}
      {!report && !latest.loading && <p className="text-sm text-ink-3">No library report yet. Press “Organize library”.</p>}
      {report && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone={report.provider === "meta_muse_spark" ? "accent" : "warn"}>
              {report.provider === "meta_muse_spark" ? `Meta Muse Spark · ${report.model_id}` : "Offline rules · no model"}
            </Badge>
            <Badge>{report.skill_count} saved skills · {report.duplicates.reduce((n, d) => n + d.duplicate_skill_ids.length, 0)} near-copies</Badge>
          </div>
          {report.summary && <ModelText>{report.summary}</ModelText>}
          {tips.length === 0 ? <p className="text-sm text-ink-3">Nothing to suggest: every robot has learned every saved task.</p> : (
            <ol className="grid gap-2 md:grid-cols-3" aria-label="Suggested next transfers">
              {tips.map((t) => {
                const s = byId.get(t.source_skill_id);
                return (
                  <li key={`${t.source_skill_id}:${t.target_robot_id}`} className="rounded-xl border border-line p-3 text-sm">
                    <p>Teach the <b>{robotName(t.target_robot_id)}</b> {s ? <>“{taskTitle(s)}”</> : "this task"}
                      {s && <> from the {robotName(s.source_robot_id)}</>}.</p>
                    {s && <Link className="mt-2 inline-block text-xs text-accent hover:underline"
                      href={`/transfer?source=${s.source_robot_id}&target=${t.target_robot_id}&skill=${encodeURIComponent(s.skill_id)}`}>
                      Teach it →</Link>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
