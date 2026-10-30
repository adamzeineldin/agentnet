"use client";

import Link from "next/link";
import { useApi } from "@/lib/useApi";
import type { ControllerStatusInfo, Health, RealDatasetSummary } from "@/lib/types";
import { Badge, EvidenceTag, type EvidenceKind, Panel } from "./ui";

interface Step {
  n: number;
  title: string;
  body: string;
  evidence: EvidenceKind[];
  href: string;
  cta: string;
}

const STEPS: Step[] = [
  { n: 1, title: "Get experience", evidence: ["sim", "real"], href: "/transfer", cta: "Discover a skill",
    body: "Either Robot A (Panda) searches 10 candidate routes past an obstacle in MuJoCo and keeps the one that " +
      "verifies, or a motion recorded on a real Panda (DROID dataset) is imported as an end-effector path." },
  { n: 2, title: "Publish a capsule", evidence: ["sim"], href: "/skills", cta: "Skill Library",
    body: "The result is stored as an Experience Capsule: task geometry in the task frame, the strategy and the " +
      "evidence from the run. Never joint angles, so another robot can use it." },
  { n: 3, title: "Retarget", evidence: ["sim", "model"], href: "/transfer", cta: "Transfer Lab",
    body: "Robot B (UR5e) re-places the task in its own base frame and solves its own IK. Candidate routes are " +
      "ranked by the source's experience (offline prior, or Meta Muse Spark when a key is set)." },
  { n: 4, title: "Verify in physics", evidence: ["sim"], href: "/history", cta: "Run History",
    body: "MuJoCo executes the joint path through the robot's own servos and checks contacts, joint limits and " +
      "endpoint error. Failed runs are kept and shown with their reason." },
  { n: 5, title: "Check on the controller", evidence: ["controller"], href: "/transfer", cta: "Try with URSim",
    body: "Optionally the same joint path is streamed to URSim, Universal Robots' controller software, which " +
      "reports the joints and tool position it reached. Not a physical arm." },
  { n: 6, title: "Organize the library", evidence: ["sim", "model"], href: "/skills", cta: "Librarian",
    body: "The librarian groups skills, finds duplicates and robots that are missing a skill, and suggests the " +
      "next transfer. It never edits skills." },
];

const EVIDENCE_ROWS: { kind: EvidenceKind; what: string; where: string }[] = [
  { kind: "real", what: "End-effector paths recorded on a physical Franka Panda by the DROID dataset (MIT).",
    where: "Real Data" },
  { kind: "sim", what: "Every success/failure, error, contact count and video: computed by AgentNet in MuJoCo.",
    where: "everywhere" },
  { kind: "controller", what: "What UR's controller software reported after the path was streamed to it.",
    where: "Transfer Lab, Real Data" },
  { kind: "model", what: "Rankings and wording from Meta Muse Spark; never a measurement.",
    where: "Transfer Lab, Librarian" },
];

function SystemStatus() {
  const health = useApi<Health>("/api/health");
  const ursim = useApi<ControllerStatusInfo>("/api/controller/status");
  const real = useApi<RealDatasetSummary[]>("/api/real-data");
  const episodes = real.data?.reduce((n, d) => n + d.episodes.length, 0);
  const rows: [string, string, "good" | "warn" | "bad" | "neutral"][] = [
    ["Simulator", health.data ? `MuJoCo ${health.data.versions.mujoco}` : health.error ? "unreachable" : "…",
      health.data ? "good" : health.error ? "bad" : "neutral"],
    ["Strategy reasoning", health.data?.reasoning.label ?? "…", health.data ? "good" : "neutral"],
    ["Real robot data", episodes != null ? `${episodes} DROID episodes imported` : "…", episodes ? "good" : "neutral"],
    ["URSim controller", ursim.data ? (ursim.data.ready ? `ready · PolyScope ${ursim.data.controller_version}`
      : ursim.data.configured ? ursim.data.detail : "not configured on this server") : "…",
    ursim.data?.ready ? "good" : "warn"],
  ];
  return (
    <Panel title="This server right now">
      <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([k, v, tone]) => (
          <div key={k}><dt className="text-ink-3">{k}</dt><dd className="mt-1"><Badge tone={tone}>{v}</Badge></dd></div>
        ))}
      </dl>
    </Panel>
  );
}

/** Plain-language walkthrough of the pipeline and of where every number on the site comes from. */
export function HowItWorks() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-2">How it works</p>
        <h1 className="text-[28px] font-normal tracking-[-0.02em]">One robot learns it. Every robot remembers.</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          AgentNet lets robots with different bodies share what they have learned. A skill is stored as the task
          (where to go, what to avoid) plus the evidence that it worked, so another robot can solve it again with
          its own joints and check the result before anyone trusts it.
        </p>
      </div>

      <SystemStatus />

      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Pipeline">
        {STEPS.map((s) => (
          <li key={s.n} className="flex flex-col gap-3 border border-line bg-panel p-4">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-2xl font-light text-accent">{s.n}</span>
              <h2 className="text-base font-medium">{s.title}</h2>
            </div>
            <p className="flex-1 text-sm text-ink-2">{s.body}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">{s.evidence.map((e) => <EvidenceTag key={e} kind={e} />)}</div>
              <Link href={s.href} className="text-xs text-accent hover:underline">{s.cta} →</Link>
            </div>
          </li>
        ))}
      </ol>

      <Panel title="Where every number comes from">
        <table className="w-full text-left text-xs">
          <thead className="text-ink-3"><tr><th className="py-1 pr-4 font-normal">Label</th><th className="py-1 pr-4 font-normal">Meaning</th><th className="py-1 font-normal">Seen in</th></tr></thead>
          <tbody>
            {EVIDENCE_ROWS.map((r) => (
              <tr key={r.kind} className="border-t border-line align-top">
                <td className="py-2 pr-4"><EvidenceTag kind={r.kind} /></td>
                <td className="py-2 pr-4 text-ink-2">{r.what}</td>
                <td className="py-2 text-ink-3">{r.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-ink-3">
          Not done: nothing on this site has run on a physical robot arm. Simulation-verified means verified in
          MuJoCo; the URSim check runs real controller software on an idealized arm with no obstacle.
        </p>
      </Panel>

      <Panel title="Try it in three minutes">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2">
          <li><Link className="text-accent hover:underline" href="/transfer">Transfer Lab</Link>: press <b>Discover Skill</b>, then <b>Publish Experience</b>, then <b>Transfer Skill</b> and watch the UR5e solve the Panda&apos;s task its own way.</li>
          <li><Link className="text-accent hover:underline" href="/real">Real Data</Link>: pick a recorded episode and press <b>Replay in simulation</b> on the Panda, then on the UR5e, and compare the paths.</li>
          <li><Link className="text-accent hover:underline" href="/skills">Skill Library → Librarian</Link>: press <b>Organize library</b> to see duplicates, gaps and the next suggested transfer.</li>
          <li><Link className="text-accent hover:underline" href="/evaluation">Evaluation</Link>: the benchmark on 20 held-out scenes, including where shared experience did not help.</li>
        </ol>
      </Panel>
    </div>
  );
}
