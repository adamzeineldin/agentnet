import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Privacy · Nimbotics" };

const CONTACT = "azeineld1@gmail.com";
const UPDATED = "November 4, 2026";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

/** Plain-language privacy policy; every statement matches what the backend stores (models/user.py, models/blog.py). */
export default function Page() {
  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">Privacy</p>
        <h1 className="text-[34px] font-light tracking-[-0.025em]">Privacy policy</h1>
        <p className="text-sm text-ink-3">Last updated {UPDATED}</p>
      </header>

      <Section title="Browsing">
        <p>You can look through the Library and read the blog without an account. Nimbotics uses no analytics, no
          advertising and no tracking cookies.</p>
      </Section>

      <Section title="Your account">
        <p>You can sign in with Google or with an email and password. With Google, Google shares your name, email
          address, profile picture and a Google account ID with Nimbotics; Google never shares your password with us.
          With an email account, we store your email, the name you choose and a scrambled (hashed) form of your password,
          never the password itself.</p>
        <p>We use these to keep you signed in and to show your name (and picture) next to what you create. Your email
          address is never shown to other visitors.</p>
        <p>A cookie named <span className="font-mono text-sm">nimbotics_session</span> keeps you signed in for up to 14 days,
          and a short-lived cookie protects the sign-in step itself. Signing out removes the session cookie.</p>
      </Section>

      <Section title="What you create is public">
        <p>Runs you start in the Lab, skills you save, robots you upload and blog posts you write can be seen by
          everyone, with your name (and, on blog posts, your picture). You can edit or delete your own posts at any
          time.</p>
        <p>If you describe a task in the Lab, that text may be sent to Meta&apos;s Muse Spark model to suggest or design
          a task. It is sent without your name or email.</p>
      </Section>

      <Section title="Sharing and deletion">
        <p>We don&apos;t sell or share your information. To have your account and everything tied to it deleted, email{" "}
          <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">{CONTACT}</a>.</p>
      </Section>

      <p className="text-sm"><Link href="/" className="text-accent hover:underline">← Back to Nimbotics</Link></p>
    </article>
  );
}
