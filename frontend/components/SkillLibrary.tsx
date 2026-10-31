"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/lib/useApi";
import type { ExperienceCapsule, RobotSummary } from "@/lib/types";
import { groupByTask } from "./skills/grouping";
import { LibrarianStrip } from "./skills/LibrarianStrip";
import { TaskCard } from "./skills/TaskCard";
import { ErrorNote, Loading, PageHeader } from "./ui";

/** Skills, organised the way people think about them: one card per task, every robot that can do it inside. */
export function SkillLibrary() {
  const skills = useApi<ExperienceCapsule[]>("/api/skills", 10000);
  const robots = useApi<RobotSummary[]>("/api/robots");
  const params = useSearchParams();
  const router = useRouter();
  const robot = params.get("robot");
  const robotName = (id: string) => robots.data?.find((r) => r.robot_id === id)?.short_name ?? id;
  const groups = skills.data && robots.data ? groupByTask(skills.data, robots.data) : [];
  const visible = robot ? groups.filter((g) => g.byRobot.some((b) => b.robotId === robot)) : groups;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Shared memory" title="Skills" guide="steps">
        Each card is one task the robots have practised. Inside it: every robot that can do it, how it does it, and
        whether it worked it out itself or learned it from another robot.
      </PageHeader>
      {(skills.error || robots.error) && <ErrorNote message={(skills.error || robots.error)!} />}
      {(skills.loading || robots.loading) && <Loading />}
      {robots.data && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Show skills of">
          <button role="tab" aria-selected={!robot} onClick={() => router.replace("/skills", { scroll: false })}
            className={`pill py-1.5 text-xs ${!robot ? "border-ink bg-ink text-bg" : ""}`}>All robots</button>
          {robots.data.map((r) => (
            <button key={r.robot_id} role="tab" aria-selected={robot === r.robot_id}
              onClick={() => router.replace(`/skills?robot=${r.robot_id}`, { scroll: false })}
              className={`pill py-1.5 text-xs ${robot === r.robot_id ? "border-ink bg-ink text-bg" : ""}`}>{r.short_name}</button>
          ))}
        </div>
      )}
      {skills.data && <LibrarianStrip skills={skills.data} robotName={robotName} />}
      {skills.data?.length === 0 && (
        <p className="soft-card p-8 text-sm text-ink-3">Nothing learned yet. <Link href="/transfer" className="text-accent">Teach a robot its first task →</Link></p>
      )}
      {skills.data && skills.data.length > 0 && visible.length === 0 && (
        <p className="soft-card p-8 text-sm text-ink-3">The {robotName(robot!)} hasn&apos;t learned anything yet.{" "}
          <Link href={`/transfer?target=${robot}`} className="text-accent">Let it learn from another robot →</Link></p>
      )}
      <div className="space-y-4">
        {robots.data && visible.map((g) => <TaskCard key={g.sceneId} group={g} robots={robots.data!} robotName={robotName} />)}
      </div>
    </div>
  );
}
