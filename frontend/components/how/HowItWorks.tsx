"use client";

import Link from "next/link";
import { FAQ } from "./faq";
import { Story } from "./story/Story";

function Questions() {
  return (
    <section aria-labelledby="faq-h" className="mx-auto max-w-5xl space-y-6">
      <h3 id="faq-h" className="text-[28px] font-light tracking-[-0.02em]">Questions</h3>
      <div className="max-w-3xl border-t border-line">
        {FAQ.map((f) => (
          <details key={f.q} className="faq group border-b border-line">
            <summary className="flex list-none items-center justify-between gap-6 py-5 text-lg transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
              {f.q}
              <span aria-hidden="true" className="font-mono text-ink-3 transition-transform duration-300 group-open:rotate-45">+</span>
            </summary>
            <p className="max-w-2xl pb-6 text-ink-2">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** The home page's lower half: the scroll story, a few plain questions, and the way in. */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-h" className="scroll-mt-20 space-y-10">
      <h2 id="how-it-works-h" className="pt-12 text-center text-[32px] font-light tracking-[-0.02em] md:text-[40px]">How it works</h2>
      <Story />
      <div className="space-y-24 pt-16 pb-8">
        <Questions />
        <div className="mx-auto max-w-5xl">
          <h3 className="text-[28px] font-light tracking-[-0.02em]">Try it yourself</h3>
          <p className="mt-3 text-ink-2">Pick two robots, let one learn, and watch the other adapt.</p>
          <Link href="/transfer" className="button-primary mt-7">Try it now →</Link>
        </div>
      </div>
    </section>
  );
}
