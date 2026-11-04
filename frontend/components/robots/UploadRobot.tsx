"use client";

import { useRef, useState } from "react";
import { ApiError, uploadRobot } from "@/lib/api";
import type { ArmOption, UploadResult } from "@/lib/types";
import { ActButton } from "../auth/SignIn";
import { Disclosure, ErrorNote } from "../ui";

const EXAMPLE = "/examples/nimbotics-capsule-arm.xml";

interface Choice { tool?: string; modelOnly?: boolean }

function armOptions(e: unknown): ArmOption[] | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const options = (e.detail as { options?: ArmOption[] } | undefined)?.options;
  return Array.isArray(options) ? options : null;
}

/** "left_wrist_yaw_link" → "left wrist yaw link". */
function limbName(tool: string): string {
  return tool.replace(/[_/]+/g, " ").trim();
}

/**
 * Upload your own robot (MJCF, URDF or a zip with meshes); the backend checks, completes and measures it. Any robot
 * may carry an arm: when several limbs could be the arm the uploader picks one, and the rest is held still. A robot
 * with no usable arm (or one the uploader only wants to keep) is stored as a model only.
 */
export function UploadRobot({ onAdded }: { onAdded: (robotId: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [tool, setTool] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ArmOption[] | null>(null);
  const [noArm, setNoArm] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  function reset() {
    setResult(null);
    setError(null);
    setOptions(null);
    setNoArm(false);
  }

  async function send(choice: Choice = {}) {
    if (!file) return;
    setBusy(true);
    reset();
    try {
      const res = await uploadRobot(file, name.trim() || file.name.replace(/\.[^.]+$/, "").slice(0, 40), {
        tool: choice.tool ?? (tool.trim() || undefined), modelOnly: choice.modelOnly,
      });
      setResult(res);
      onAdded(res.robot?.robot_id ?? res.model?.robot_id ?? "");
    } catch (e: unknown) {
      const picks = armOptions(e);
      if (picks) {
        setOptions(picks);
      } else {
        const message = e instanceof Error ? e.message.replace(/^\d+: /, "") : "The upload failed";
        setError(message);
        setNoArm(e instanceof ApiError && e.status === 422 && message.includes("model only"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="soft-card space-y-3 p-5">
      <div>
        <h3 className="text-base font-medium">Upload your own robot</h3>
        <ul className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-2" aria-label="What it accepts"
          title="Nimbotics finds the arm and its tool, holds the rest of the robot still, adds motors and a resting pose if missing, checks it holds still in physics and measures its reach.">
          {[".xml", ".urdf", ".zip with meshes", "an arm of 3–10 joints", "any robot as a model", "up to 20 MB"].map((t) => (
            <li key={t} className="rounded-full bg-panel-2 px-2.5 py-1 font-mono">{t}</li>
          ))}
          <li><a href={EXAMPLE} download className="ml-1 text-accent hover:underline">Example arm ↓</a></li>
        </ul>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-3">
          Model file
          <input ref={input} type="file" accept=".xml,.urdf,.zip" disabled={busy} aria-label="Robot model file"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }}
            className="max-w-full text-sm text-ink file:mr-3 file:border file:border-line-strong file:bg-panel file:px-3 file:py-1.5 file:text-ink" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} disabled={busy} placeholder="My robot"
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
      {options && (
        <div role="group" aria-label="Pick the arm" className="space-y-2 rounded-xl bg-panel-2/60 p-4 text-sm">
          <p>This robot has {options.length} limbs that could be the arm. Which one should run tasks? The rest is held still.</p>
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <ActButton key={o.tool} onClick={() => void send({ tool: o.tool })} disabled={busy} className="pill text-xs">
                <span className="font-mono">{limbName(o.tool)}</span> · {o.joints} joints
              </ActButton>
            ))}
          </div>
          <ActButton onClick={() => void send({ modelOnly: true })} disabled={busy} className="text-xs text-accent hover:underline">
            None of these: keep it as a model only
          </ActButton>
        </div>
      )}
      {error && <ErrorNote message={error} />}
      {noArm && (
        <ActButton onClick={() => void send({ modelOnly: true })} disabled={busy} className="pill text-xs">
          Keep it as a model only (no tasks)
        </ActButton>
      )}
      {result && (
        <div className="rounded-xl border border-good/40 bg-panel px-4 py-3 text-sm" aria-live="polite">
          {result.robot && (
            <p className="text-good">✓ The {result.robot.short_name} ({result.robot.dof} joints, reaches {result.robot.max_reach_m.toFixed(2)} m)
              is in the fleet. Pick it in the Lab.</p>
          )}
          {result.model && (
            <p className="text-good">✓ Stored the {result.model.name} ({result.model.joints} joints) as a model only. It is in the
              Library but cannot run tasks.</p>
          )}
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-2">
            {result.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
