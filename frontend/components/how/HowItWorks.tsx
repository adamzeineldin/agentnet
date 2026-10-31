"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Disclosure, EvidenceTag } from "../ui";
import { GLOSSARY } from "@/lib/glossary";
import { EVIDENCE, STEPS } from "./content";
import { IdeaFlow } from "./IdeaFlow";
import { LiveStatus } from "./LiveStatus";
import { MuseExplainer } from "./MuseExplainer";
import { WallSketch } from "./WallSketch";

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 space-y-3">
      <h3 id={`${id}-h`} className="text-xl font-normal tracking-[-0.01em]">{title}</h3>
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
              <h4 className="text-base font-medium">{s.title}</h4>
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

/** The home page's lower half: the idea, the one task, each step, where AI fits, what is real, and where to start. */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-h" className="scroll-mt-20 space-y-12">
      <header className="space-y-3">
        <p className="eyebrow">How it works</p>
        <h2 id="how-it-works-h" className="text-[32px] font-light tracking-[-0.02em]">Teach one robot arm a task. Let a different arm do it too.</h2>
        <p className="max-w-3xl text-ink-2">
          Nimbotics is a shared memory for robot arms. When one arm figures out a task, it saves what it learned.
          A different arm, with a different body, loads that memory, works out its own way to do the task, and has to
          pass a physics test before the result is trusted. Everything happens in simulation.
        </p>
      </header>

      <Section id="idea" title="The idea in four steps">
        <IdeaFlow />
      </Section>

      <Section id="task" title="The task: reach past a wall"
        intro="Every robot on this site solves the same kind of puzzle. Move the hand from a start point to a target point. A small wall stands in between, so the straight line hits it. The arm has to go over the wall or around one of its sides.">
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <WallSketch />
          <aside className="soft-card border-accent/40 p-5">
            <h4 className="text-sm font-medium">What is a layout number?</h4>
            <p className="mt-2 text-sm text-ink-2">
              The wall&apos;s size and the start and target positions are picked at random. The layout number (in
              code, the &ldquo;seed&rdquo;) does the picking: the same number always gives the same layout, so results
              can be repeated. Think of it as a level number.
            </p>
          </aside>
        </div>
      </Section>

      <Section id="steps" title="What happens when you press Try it" intro="Open “Technical detail” only if you want the engineering version.">
        <StepList />
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">Real recordings work the same way.</span> On{" "}
          <Link href="/real" className="text-accent hover:underline">Real data</Link>, motions recorded on a real
          Panda are replayed in the simulator on any arm, and we measure how closely each one follows the real path.
        </p>
      </Section>

      <Section id="muse" title="Where the AI model fits">
        <MuseExplainer />
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

      <Section id="glossary" title="Words you'll see">
        <Disclosure summary="Glossary" hint={`${Object.keys(GLOSSARY).length} terms in plain words`}>
          <dl className="grid gap-px overflow-hidden rounded-[18px] border border-line bg-line sm:grid-cols-2">
            {Object.values(GLOSSARY).map((g) => (
              <div key={g.term} className="bg-panel p-3">
                <dt className="text-sm font-medium">{g.term}</dt>
                <dd className="mt-1 text-sm text-ink-2">{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      </Section>

      <Section id="try" title="Try it yourself" intro="Takes about a minute: pick two robots, let one learn, let the other adapt.">
        <Link href="/transfer" className="button-primary">Try it now →</Link>
        <LiveStatus />
      </Section>
    </section>
  );
}
