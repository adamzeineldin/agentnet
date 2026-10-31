"use client";

import Link from "next/link";
import { HowItWorks } from "./how/HowItWorks";
import { ParticleArm } from "./ParticleArm";

export function Overview() {
  return (
    <div className="space-y-16 pb-8">
      <section data-landing-hero className="landing-hero">
        <ParticleArm />
        <div data-hero-copy className="hero-copy">
          <p className="eyebrow">Simulate · Remember · Retarget</p>
          <h1>One robot learns it.<br />Every robot remembers.</h1>
          <p className="hero-description">
            Nimbotics discovers robot motion in simulation, stores verified experience in shared memory,
            and retargets each skill through another robot’s own kinematics.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/transfer" className="button-primary">Try it</Link>
            <a href="#how-it-works" className="button-secondary">How it works</a>
          </div>
          <div className="hero-steps">
            <div><h2>Simulate</h2><p>Search motion candidates and verify them in MuJoCo.</p></div>
            <div><h2>Remember</h2><p>Publish simulation-verified experience with its evidence.</p></div>
            <div><h2>Retarget</h2><p>Solve new joint paths and verify each adaptation in simulation.</p></div>
          </div>
        </div>
      </section>

      <HowItWorks />
    </div>
  );
}
