"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "../Logo";
import { ProviderIcon } from "./SignIn";

interface AuthCardProps {
  title: string;
  /** Where to come back to after signing in. */
  next: string;
  /** Below the card: the link to the other page ("New to Nimbotics? Create an account"). */
  footer: ReactNode;
  /** Offer "Continue with Google" (off on later steps of a form, e.g. naming a new account). */
  providers?: boolean;
  children: ReactNode;
}

/** The sign-in / create-account layout: logo, white card with Google first, an "or" line, then the form. */
export function AuthCard({ title, next, footer, providers = true, children }: AuthCardProps) {
  const { config, providerUrl } = useAuth();
  const google = providers && config?.providers.includes("google");
  return (
    <div className="flex min-h-screen flex-col items-center px-4 pt-8 pb-10">
      <Link href="/" aria-label="nimbotics home" className="text-[32px] leading-none font-semibold">
        <Logo />
      </Link>
      <section aria-labelledby="auth-title"
        className="mt-8 w-full max-w-[26rem] rounded-[28px] border border-line bg-panel px-6 py-8 text-center shadow-[0_24px_60px_-28px_rgba(0,0,0,.35)] sm:px-9">
        <h1 id="auth-title" className="text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[26px]">{title}</h1>
        <div className="mt-6 space-y-4">
          {google && (
            <>
              <a href={providerUrl("google", next)}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-panel text-[15px] font-medium text-ink-2 shadow-[0_2px_6px_-3px_rgba(0,0,0,.2)] transition-colors hover:bg-panel-2">
                <ProviderIcon provider="google" large /> Continue with Google
              </a>
              {config?.password && (
                <div className="flex items-center gap-4 text-[14px] text-ink-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-line-strong" />or<span className="h-px flex-1 bg-line-strong" />
                </div>
              )}
            </>
          )}
          {children}
        </div>
      </section>
      <p className="mt-6 text-[15px] text-ink-2">{footer}</p>
    </div>
  );
}
