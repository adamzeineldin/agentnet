import Link from "next/link";
import type { CoverageGap, DuplicateGroup, LibraryReport, SkillCollection } from "@/lib/types";
import { Badge, Panel } from "../ui";

type OpenSkill = (skillId: string) => void;

function SkillChip({ id, onOpen }: { id: string; onOpen: OpenSkill }) {
  return (
    <button onClick={() => onOpen(id)} aria-label={`Open skill ${id}`}
      className="border border-line px-2 py-0.5 font-mono text-[10px] text-ink-2 hover:border-accent hover:text-accent">
      {id}
    </button>
  );
}

/** Text the model wrote; always labelled so it is never mistaken for a measured result. */
export function ModelText({ children }: { children: string }) {
  return (
    <p className="border-l-2 border-accent pl-3 text-xs text-ink-2">
      {children} <span className="font-mono text-[10px] text-ink-3">· model-written</span>
    </p>
  );
}

export function Suggestions({ report }: { report: LibraryReport }) {
  return (
    <Panel title="Suggested next transfers" right={<Badge>not executed</Badge>}>
      {report.suggestions.length === 0
        ? <p className="text-xs text-ink-3">Every original skill already has an adaptation on each other robot.</p>
        : <ol className="space-y-3">
          {report.suggestions.map((s, i) => (
            <li key={`${s.source_skill_id}:${s.target_robot_id}`} className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 text-xs">
                <span className="font-mono text-ink-3">#{i + 1}</span>{" "}
                <span className="break-all font-mono">{s.source_skill_id}</span> → <span className="font-mono">{s.target_robot_id}</span>
                <p className="mt-1 text-ink-3">{s.reason}</p>
              </div>
              <Link href={`/transfer?skill=${encodeURIComponent(s.source_skill_id)}`}
                className="shrink-0 border border-accent-dim bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20">
                Open in Transfer Lab →
              </Link>
            </li>
          ))}
        </ol>}
      {report.priority_rationale && <div className="mt-3"><ModelText>{report.priority_rationale}</ModelText></div>}
    </Panel>
  );
}

export function Collections({ items, onOpen }: { items: SkillCollection[]; onOpen: OpenSkill }) {
  return (
    <Panel title="Collections">
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((c) => (
          <li key={c.collection_id} className="space-y-2 border border-line p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{c.title}</h3>
              <span className="font-mono text-[11px] text-ink-3">{c.robot_ids.join(" · ")}</span>
            </div>
            <p className="text-[11px] text-ink-3">{c.basis}</p>
            <div className="flex flex-wrap gap-1.5">{c.skill_ids.map((id) => <SkillChip key={id} id={id} onOpen={onOpen} />)}</div>
            {c.model_note && <ModelText>{c.model_note}</ModelText>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function Duplicates({ items, onOpen }: { items: DuplicateGroup[]; onOpen: OpenSkill }) {
  return (
    <Panel title="Duplicates" right={<Badge>skills are kept as published</Badge>}>
      {items.length === 0 ? <p className="text-xs text-ink-3">No duplicate skills.</p> : (
        <ul className="space-y-4">
          {items.map((d) => (
            <li key={d.keep_skill_id} className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="good">reference</Badge><SkillChip id={d.keep_skill_id} onOpen={onOpen} />
                <span className="font-mono text-ink-3">{d.strategy} · {d.scene_id}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-ink-3">same as reference:</span>
                {d.duplicate_skill_ids.map((id) => <SkillChip key={id} id={id} onOpen={onOpen} />)}
              </div>
              <p className="text-[11px] text-ink-3">{d.basis}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function Gaps({ items }: { items: CoverageGap[] }) {
  return (
    <Panel title="Coverage gaps">
      {items.length === 0 ? <p className="text-xs text-ink-3">No coverage gaps.</p> : (
        <ul className="space-y-2 text-xs">
          {items.map((g) => (
            <li key={`${g.kind}:${g.robot_id}:${g.skill_id ?? g.scene_family}`} className="flex flex-wrap gap-2">
              <Badge tone="warn">{g.kind === "skill_not_transferred" ? "not transferred" : "missing scene family"}</Badge>
              <span className="text-ink-2">{g.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
