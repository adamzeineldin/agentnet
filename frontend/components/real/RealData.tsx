"use client";

import { useState } from "react";
import { startRealReplay } from "@/lib/api";
import { fmtM, fmtSec, shortHash } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useRunStream } from "@/lib/useRunStream";
import type {
  ControllerStatusInfo, ExecuteOn, RealDatasetSummary, RealEpisode, RealReplayResults, RunRecord,
} from "@/lib/types";
import { EventLog } from "../RunEvidence";
import { ControllerPanel } from "../transfer/ControllerPanel";
import { RunVideo } from "../transfer/RunMedia";
import { Badge, ErrorNote, EvidenceTag, Loading, Panel, Stat, StatusBadge } from "../ui";
import { PathPlot } from "./PathPlot";

const ROBOTS = [
  { id: "panda_01", label: "Panda", note: "same robot model as recorded" },
  { id: "ur5e_01", label: "UR5e", note: "different robot: retarget the recorded path" },
] as const;

function SourceCard({ ds }: { ds: RealDatasetSummary }) {
  const s = ds.source;
  return (
    <Panel title={s.title} right={<EvidenceTag kind="real" />}>
      <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-ink-3">Recorded on</dt><dd>{s.recorded_robot}</dd></div>
        <div><dt className="text-ink-3">Data</dt><dd>end-effector position at {s.fps} Hz, {s.frame}</dd></div>
        <div><dt className="text-ink-3">License</dt><dd>{s.license} · <a className="underline" href={s.url} target="_blank" rel="noreferrer">dataset</a></dd></div>
        <div><dt className="text-ink-3">Revision</dt><dd className="font-mono">{shortHash(s.revision)}</dd></div>
      </dl>
      <p className="mt-3 text-[11px] text-ink-3">Imported episodes: {ds.selection}. {s.notes.join(" ")} {s.citation}.</p>
    </Panel>
  );
}

function ReplayResult({ run, live }: { run: RunRecord; live: boolean }) {
  const r = run.results as unknown as RealReplayResults;
  const dev = r.path_deviation;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={run.status} /><Badge tone={live ? "accent" : "neutral"}>{live ? "● live" : "recorded run"}</Badge>
        <EvidenceTag kind="sim" /><Badge>{r.embodiment}</Badge>
        <span className="font-mono text-[11px] text-ink-3">{run.run_id}</span>
      </div>
      <RunVideo run={run} busy={live && !run.artifacts.video} emptyLabel="Not replayed yet" />
      <div className="metric-grid grid grid-cols-2 sm:grid-cols-4">
        <Stat label="Max deviation from real path" value={dev ? fmtM(dev.max_m) : "—"} hint={dev ? `limit ${fmtM(dev.tolerance_m, 0)}` : undefined} />
        <Stat label="Mean deviation" value={dev ? fmtM(dev.mean_m) : "—"} />
        <Stat label="Collisions" value={run.collision_count ?? "—"} />
        <Stat label="Simulated time" value={fmtSec(run.simulated_seconds)} hint={`recorded ${fmtSec(r.real_data.recorded_duration_s)}`} />
      </div>
      {r.checks && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {Object.entries(r.checks).map(([k, v]) => (
            <li key={k}><Badge tone={v ? "good" : "bad"}>{v ? "✓" : "✕"} {k.replaceAll("_", " ")}</Badge></li>
          ))}
        </ul>
      )}
      {r.controller_execution && <ControllerPanel execution={r.controller_execution} />}
      <details open={live} className="text-xs">
        <summary className="cursor-pointer text-ink-3">What happened, step by step ({run.events.length} events)</summary>
        <div className="mt-2"><EventLog events={run.events} /></div>
      </details>
    </div>
  );
}

function EpisodeView({ datasetId, index }: { datasetId: string; index: number }) {
  const ep = useApi<RealEpisode>(`/api/real-data/${datasetId}/${index}`);
  const ursim = useApi<ControllerStatusInfo>("/api/controller/status");
  const stream = useRunStream();
  const [robot, setRobot] = useState<string>("ur5e_01");
  const [onUrsim, setOnUrsim] = useState(false);
  const ursimReady = ursim.data?.ready === true && robot === "ur5e_01";
  const run = stream.run?.results.real_data &&
    (stream.run.results as unknown as RealReplayResults).real_data.episode_index === index ? stream.run : null;
  const simulated = run ? (run.results as unknown as RealReplayResults).simulated_path : undefined;

  if (ep.error) return <ErrorNote message={ep.error} />;
  if (!ep.data) return <Loading />;
  const e = ep.data;
  const replay = () => {
    const executeOn: ExecuteOn = onUrsim && ursimReady ? "ursim" : "none";
    void stream.start(() => startRealReplay(datasetId, index, robot, executeOn));
  };
  return (
    <div className="space-y-6">
      <Panel title={`Episode ${e.episode_index} · “${e.task}”`} right={<EvidenceTag kind="real" />}>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <PathPlot recorded={e.ee_xyz} simulated={simulated} />
            <p className="text-[11px] text-ink-3">
              {e.frames} frames over {e.duration_s.toFixed(1)} s, recorded on {e.source.recorded_robot}. Only the
              end-effector positions are used; the real scene&apos;s objects are not simulated.
            </p>
          </div>
          <div className="space-y-4 text-xs">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-ink-3">Replay the recorded path in MuJoCo on</legend>
              {ROBOTS.map((r) => (
                <label key={r.id} className="flex items-center gap-2">
                  <input type="radio" name="robot" checked={robot === r.id} disabled={stream.busy} onChange={() => setRobot(r.id)} />
                  <span className="font-medium">{r.label}</span><span className="text-ink-3">· {r.note}</span>
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-ink-3" title={ursim.data?.detail}>
              <input type="checkbox" aria-label="Also run on the URSim controller (not physical)"
                checked={onUrsim && ursimReady} disabled={stream.busy || !ursimReady} onChange={(ev) => setOnUrsim(ev.target.checked)} />
              also run on the URSim controller (not physical)
              {!ursimReady && <span>· {robot !== "ur5e_01" ? "UR5e only" : ursim.data?.configured ? "not ready" : "not configured"}</span>}
            </label>
            <button onClick={replay} disabled={stream.busy} className="button-primary disabled:opacity-50">
              {stream.busy ? "Replaying…" : "Replay in simulation"}
            </button>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] text-ink-3">
              <li>Resample the recorded path every 2 cm (pauses dropped).</li>
              <li>The robot stands where the recording robot stood and solves its own IK along the path.</li>
              <li>Screen for contacts, then execute through its own servos in MuJoCo, paced to the recorded duration.</li>
              <li>Measure how far the simulated end effector strays from the real path (limit 10 mm).</li>
            </ol>
          </div>
        </div>
      </Panel>
      {stream.error && <ErrorNote message={stream.error} />}
      {run && <Panel title="Replay result"><ReplayResult run={run} live={stream.live} /></Panel>}
    </div>
  );
}

/** Real robot data: recorded episodes from a public dataset, replayed and retargeted in simulation. */
export function RealData() {
  const datasets = useApi<RealDatasetSummary[]>("/api/real-data");
  const [selected, setSelected] = useState<number | null>(null);
  const ds = datasets.data?.[0];
  const index = selected ?? ds?.episodes[0]?.episode_index ?? null;
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="eyebrow mb-2">Real robot data</p>
        <h1 className="text-[28px] font-normal tracking-[-0.02em]">Real Data</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Motions recorded on a physical Franka Panda by the public DROID dataset. AgentNet takes the recorded
          end-effector path (task geometry, not joint angles), has a robot re-solve it with its own kinematics, and
          checks the result in MuJoCo, optionally also on the UR controller software.
        </p>
        <div className="flex flex-wrap gap-2"><EvidenceTag kind="real" /><EvidenceTag kind="sim" /><EvidenceTag kind="controller" /></div>
      </div>
      {datasets.error && <ErrorNote message={datasets.error} />}
      {!ds && !datasets.error && <Loading />}
      {ds && (
        <>
          <SourceCard ds={ds} />
          <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <nav aria-label="Recorded episodes" className="border border-line bg-panel">
              {ds.episodes.map((e) => (
                <button key={e.episode_index} onClick={() => setSelected(e.episode_index)}
                  aria-current={index === e.episode_index ? "true" : undefined}
                  className={`block w-full border-b border-line px-3 py-2.5 text-left last:border-b-0 ${index === e.episode_index ? "bg-panel-2" : "hover:bg-panel-2"}`}>
                  <div className="text-sm">{e.task}</div>
                  <div className="font-mono text-[10px] text-ink-3">episode {e.episode_index} · {e.duration_s.toFixed(1)} s · {e.frames} frames</div>
                </button>
              ))}
            </nav>
            {index !== null && <EpisodeView key={index} datasetId={ds.source.dataset_id} index={index} />}
          </div>
        </>
      )}
    </div>
  );
}
