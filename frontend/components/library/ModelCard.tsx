"use client";

import { apiUrl } from "@/lib/api";
import type { StoredModel } from "@/lib/types";
import { Disclosure } from "../ui";
import { PrivateBadge, SharedBy, VisibilityControl } from "./Visibility";

interface ModelCardProps {
  model: StoredModel;
  /** The owner made it public or private: reload the list. */
  onShared: () => void;
}

/** An upload kept as a model only: its picture and what was read from it. It has no robot page because it cannot run. */
export function ModelCard({ model, onShared }: ModelCardProps) {
  return (
    <article aria-label={`${model.name}, model only`} className="soft-card overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the backend from the uploaded model */}
      <img src={apiUrl(model.snapshot_url)} alt={`The ${model.name}`} className="aspect-[4/3] w-full bg-panel-2 object-cover" />
      <div className="space-y-2 p-3.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{model.name}</span>
          {model.visibility === "private" && <PrivateBadge />}
        </div>
        <p className="text-xs text-ink-3" title="Stored and shown, but it cannot run tasks: no arm was chosen for it.">
          Model only · {model.joints} joints · {model.bodies} parts
        </p>
        <SharedBy by={model.published_by} at={model.published_at} mine={model.mine} className="block" />
        <Disclosure summary="What was read from it" hint={model.uploaded_by ?? undefined}>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-2">{model.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Disclosure>
        {model.mine && <VisibilityControl kind="robot" id={model.robot_id} visibility={model.visibility} onChanged={onShared} />}
      </div>
    </article>
  );
}
