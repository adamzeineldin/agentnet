"use client";

import Link from "next/link";
import { useApi } from "@/lib/useApi";
import type { Health, LibraryReport, ReasoningTrace } from "@/lib/types";
import { EvidenceTag } from "../ui";

/** Where Meta Muse Spark is (and is not) used. With a run's trace, also says what that run did. */
export function MuseExplainer({ trace }: { trace?: ReasoningTrace }) {
  const health = useApi<Health>("/api/health");
  const report = useApi<LibraryReport>("/api/library/reports/latest");
  const on = health.data?.reasoning.mode === "meta_configured";
  const usedHere = trace?.provider_used === "meta_muse_spark";
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ink-2">
        Meta Muse Spark is an AI language model. It never moves a robot and never decides whether something passed;
        the physics simulator does that. It has two optional jobs, and both fall back to fixed rules when it is off.
        {health.data && <> On this server it is <b>{on ? "switched on" : "switched off"}</b>.</>}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="soft-card space-y-2 p-5">
          <div className="flex items-center justify-between gap-2"><h3 className="font-medium">Job 1 · picking which route to try first</h3><EvidenceTag kind="model" /></div>
          <p className="text-sm text-ink-2">
            When a robot learns from another, there are up to ten ways past the wall. Muse reads the teacher&apos;s skill
            and the learner&apos;s body and suggests which to try first. Only the top few get a full physics test.
          </p>
          <p className="text-xs text-ink-3">
            Without it, a fixed rule decides: the teacher&apos;s route first, then the most similar ones.
            {trace && " " + (usedHere
              ? `This run used Muse (${trace.model_calls} call${trace.model_calls === 1 ? "" : "s"}${trace.estimated_cost_usd != null ? `, about $${trace.estimated_cost_usd.toFixed(4)}` : ""}).`
              : trace.fallback_error ? "This run asked for Muse, but the call failed, so the fixed rule was used." : "This run used the fixed rule; no AI model was called.")}
          </p>
        </div>
        <div className="soft-card space-y-2 p-5">
          <div className="flex items-center justify-between gap-2"><h3 className="font-medium">Job 2 · the librarian</h3><EvidenceTag kind="model" /></div>
          <p className="text-sm text-ink-2">
            On the Skills page, the librarian looks over everything learned so far and suggests what to teach next:
            which robot hasn&apos;t learned which task yet, and which saved skills are near-copies.
          </p>
          <p className="text-xs text-ink-3">
            The suggestions themselves come from fixed rules; Muse only adds a written summary and reorders them. It
            can&apos;t change or delete a skill.{" "}
            {report.data && `The latest report was written by ${report.data.provider === "meta_muse_spark" ? "Muse" : "the fixed rules"}. `}
            <Link href="/skills" className="text-accent hover:underline">See the skills →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
