"use client";

import { useRef, useState } from "react";
import { uploadRobot } from "@/lib/api";
import type { UploadResult } from "@/lib/types";
import { ActButton } from "../auth/SignIn";
import { Disclosure, ErrorNote } from "../ui";

const EXAMPLE = "/examples/nimbotics-capsule-arm.xml";

/** Upload your own arm (MJCF, URDF or a zip with meshes); the backend checks, completes and measures it. */
export function UploadRobot({ onAdded }: { onAdded: (robotId: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [tool, setTool] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function send() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await uploadRobot(file, name.trim() || file.name.replace(/\.[^.]+$/, "").slice(0, 40), tool.trim() || undefined);
      setResult(res);
      onAdded(res.robot.robot_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="soft-card space-y-3 p-5">
      <div>
        <h3 className="text-base font-medium">Upload your own robot</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Any fixed-base arm with 3 to 10 joints: a MuJoCo <span className="font-mono">.xml</span>, a{" "}
          <span className="font-mono">.urdf</span>, or a <span className="font-mono">.zip</span> holding the model and its
          mesh files (up to 20 MB). Nimbotics finds the arm&apos;s joints and its tool, adds motors and a resting pose if the
          model has none, checks that it can hold itself still in physics, and measures its reach. Then it can learn
          every task like the other arms. No file? <a href={EXAMPLE} download className="text-accent underline">Download an
          example arm</a> and upload it.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-3">
          Model file
          <input ref={input} type="file" accept=".xml,.urdf,.zip" disabled={busy} aria-label="Robot model file"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); }}
            className="max-w-full text-sm text-ink file:mr-3 file:border file:border-line-strong file:bg-panel file:px-3 file:py-1.5 file:text-ink" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} disabled={busy} placeholder="My arm"
            aria-label="Robot name" className="w-44 border border-line-strong bg-panel px-3 py-2 text-sm text-ink" />
        </label>
        <ActButton onClick={() => void send()} disabled={!file || busy} className="button-primary disabled:cursor-wait disabled:opacity-50">
          {busy ? "Checking the model in MuJoCo…" : "Upload and check"}
        </ActButton>
      </div>
      <Disclosure summary="Tool point (advanced)" hint={tool ? tool : "found automatically"}>
        <label className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          Name of the site or link the task is measured at
          <input value={tool} onChange={(e) => setTool(e.target.value)} maxLength={64} disabled={busy} placeholder="e.g. tool0"
            aria-label="Tool site or link" className="w-40 border border-line-strong bg-panel px-2 py-1 font-mono text-sm text-ink" />
        </label>
      </Disclosure>
      {error && <ErrorNote message={error} />}
      {result && (
        <div className="rounded-xl border border-good/40 bg-panel px-4 py-3 text-sm" aria-live="polite">
          <p className="text-good">✓ The {result.robot.short_name} ({result.robot.dof} joints, reaches {result.robot.max_reach_m.toFixed(2)} m)
            is in the fleet. Pick it on the Teach page.</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-2">
            {result.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
