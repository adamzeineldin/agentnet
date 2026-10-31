"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { EvidenceTag, Panel } from "../ui";
import { GLOSSARY } from "@/lib/glossary";
import { EVIDENCE, STEPS } from "./content";
import { IdeaFlow } from "./IdeaFlow";
import { LiveStatus } from "./LiveStatus";
import { WallSketch } from "./WallSketch";

const SECTIONS = [
  ["idea", "The idea"],
  ["task", "The task"],
  ["steps", "Step by step"],
  ["trust", "What's real?"],
  ["glossary", "Glossary"],
  ["deeper", "Go deeper"],
  ["try", "Try it"],
] as const;

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 space-y-3">
      <h2 id={`${id}-h`} className="text-xl font-normal tracking-[-0.01em]">{title}</h2>
      {intro && <p className="max-w-3xl text-sm text-ink-2">{intro}</p>}
      {children}
    </section>
  );
}

function StepList() {
  return (
    <ol aria-label="Pipeline" className="space-y-3">
      {STEPS.map((s, i) => (
        <li key={s.title} className="soft-card grid gap-3 p-5 md:grid-cols-[2.5rem_1fr]">
          <span className="font-mono text-2xl font-light text-accent">{i + 1}</span>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-medium">{s.title}</h3>
              <div className="flex flex-wrap gap-1.5">{s.evidence.map((e) => <EvidenceTag key={e} kind={e} />)}</div>
            </div>
            <p className="text-sm text-ink-2">{s.what}</p>
            <p className="text-sm text-ink-2"><span className="text-ink-3">What you see: </span>{s.see}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <details className="text-xs text-ink-3">
                <summary className="cursor-pointer select-none hover:text-ink">Technical detail</summary>
                <p className="mt-2 max-w-2xl">{s.detail}</p>
              </details>
              <Link href={s.href} className="text-xs text-accent hover:underline">{s.cta} →</Link>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A beginner-first guide: the idea, the one task, each step, what is real, a glossary, and where to start. */
export function HowItWorks() {
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow">How it works</p>
        <h1 className="text-[28px] font-normal tracking-[-0.02em]">Teach one robot arm a task. Let a different arm do it too.</h1>
        <p className="max-w-3xl text-sm text-ink-2">
          Nimbotics is a shared memory for robot arms. When one arm figures out a task, it saves what it learned.
          A different arm, with a different body, loads that memory, works out its own way to do the task, and has to
          pass a physics test before the result is trusted. Everything happens in simulation.
        </p>
        <nav aria-label="On this page" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-ink-3 hover:text-accent">{label}</a>
          ))}
        </nav>
      </header>

      <Section id="idea" title="The idea in four steps">
        <IdeaFlow />
      </Section>

      <Section id="task" title="The task: reach past a wall"
        intro="Every robot on this site solves the same kind of puzzle. Move the hand from a start point to a target point. A small wall stands in between, so the straight line hits it. The arm has to go over the wall or around one of its sides.">
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <WallSketch />
          <aside className="soft-card border-accent/40 p-5">
            <h3 className="text-sm font-medium">What is a seed?</h3>
            <p className="mt-2 text-sm text-ink-2">
              The wall&apos;s size and the start and target positions are picked at random. The seed is the number
              that does the picking. The same seed always gives the same layout, so results can be repeated; a new
              seed gives a new layout. Think of it as a level number.
            </p>
            <p className="mt-2 text-xs text-ink-3">
              In Transfer Lab, the seed box picks where the Panda learns. &ldquo;New scene, seed&rdquo; on the UR5e side
              tests the skill on a layout it has never seen.
            </p>
          </aside>
        </div>
      </Section>

      <Section id="steps" title="Step by step" intro="This is what happens when you use Transfer Lab, from left to right. Open “Technical detail” only if you want the engineering version.">
        <StepList />
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">Real recordings work the same way.</span> On{" "}
          <Link href="/real" className="text-accent hover:underline">Real Data</Link>, motions recorded on a real
          Panda are replayed in the simulator on either robot, and we measure how closely each one follows the real path.
        </p>
      </Section>

      <Section id="trust" title="What's real and what's simulated?"
        intro="Every result on the site carries one of these four labels, so you always know where a number came from.">
        <ul className="grid gap-3 sm:grid-cols-2">
          {EVIDENCE.map((e) => (
            <li key={e.kind} className="soft-card space-y-2 p-5">
              <EvidenceTag kind={e.kind} />
              <p className="text-sm text-ink-2">{e.plain}</p>
            </li>
          ))}
        </ul>
        <p className="border-l-2 border-warn pl-3 text-sm text-ink-2">
          Nothing on this site has run on a physical robot arm. &ldquo;Simulation-verified&rdquo; means it passed in
          the simulator. Failed runs are kept and shown, never hidden.
        </p>
      </Section>

      <Section id="deeper" title="Want to see a real transfer taken apart?"
        intro="Under the hood replays one recorded transfer step by step: what the teacher saved, how the task is placed in front of a different arm, how that arm ranks its routes, and exactly where the Muse model is (and isn't) used.">
        <Link href="/under-the-hood" className="button-primary">Open Under the hood →</Link>
      </Section>

      <Section id="glossary" title="Glossary" intro="Words you will see around the site.">
        <dl className="grid gap-px overflow-hidden rounded-[18px] border border-line bg-line sm:grid-cols-2">
          {Object.values(GLOSSARY).map((g) => (
            <div key={g.term} className="bg-panel p-3">
              <dt className="text-sm font-medium">{g.term}</dt>
              <dd className="mt-1 text-sm text-ink-2">{g.meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="try" title="Try it in three minutes">
        <Panel>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2">
            <li>Open <Link className="text-accent hover:underline" href="/transfer">Transfer Lab</Link>. Press <b>Discover Skill</b>, then <b>Publish Experience</b>.</li>
            <li>Press <b>Transfer Skill</b> and watch the UR5e solve the Panda&apos;s task its own way.</li>
            <li>Open <Link className="text-accent hover:underline" href="/real">Real Data</Link>, pick a recording and press <b>Replay in simulation</b>.</li>
            <li>Curious whether sharing helps? <Link className="text-accent hover:underline" href="/evaluation">Results</Link> runs the benchmark, including where it did not.</li>
          </ol>
        </Panel>
        <LiveStatus />
      </Section>
    </div>
  );
}
