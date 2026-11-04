"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { authHref, useAuth } from "@/lib/auth";
import { Loading } from "../ui";

interface SignInGateProps {
  /** What the page lets a signed-in visitor do, shown above the buttons. */
  title: string;
  points: string[];
  children: ReactNode;
}

/**
 * Shows the page only to visitors who may act: signed in, or on a server where sign-in is off. Everyone else gets
 * one card that sends them to sign in or create an account, and back here afterwards. Callers sit under <Suspense>.
 */
export function SignInGate({ title, points, children }: SignInGateProps) {
  const { config, canAct } = useAuth();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const here = `${pathname}${query ? `?${query}` : ""}`;
  if (!config) return <Loading label="Checking sign-in…" />;
  if (canAct) return <>{children}</>;
  return (
    <section aria-label="Sign in to continue" className="soft-card mx-auto max-w-xl space-y-5 p-8 text-center">
      <p className="eyebrow">Sign in to continue</p>
      <h1 className="text-[28px] font-light tracking-[-0.02em]">{title}</h1>
      <ul className="flex flex-wrap justify-center gap-1.5 text-xs text-ink-2">
        {points.map((p) => <li key={p} className="rounded-full bg-panel-2 px-3 py-1">{p}</li>)}
      </ul>
      <div className="mx-auto flex max-w-sm flex-col gap-2 sm:flex-row">
        <Link href={authHref("signin", here)} className="button-primary flex-1">Sign in</Link>
        <Link href={authHref("signup", here)} className="button-secondary flex-1">Create an account</Link>
      </div>
      <p className="text-xs text-ink-3">
        No account needed to look around: <Link href="/library" className="text-accent hover:underline">browse the Library →</Link>
      </p>
    </section>
  );
}
