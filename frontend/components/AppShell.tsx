"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { API_BASE } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { AuthProvider } from "@/lib/auth";
import type { Health } from "@/lib/types";
import { UserMenu } from "./auth/SignIn";
import { Logo } from "./Logo";
import { NavPill } from "./NavPill";

/** Three places; the logo is the way home, and How it works lives on the home page below the hero. */
export const NAV = [
  { href: "/library", label: "Library", what: "Every robot, every skill it has learned, and every run behind them" },
  { href: "/lab", label: "Lab", what: "Teach one robot a task, then watch another robot learn it (needs sign-in)" },
  { href: "/blog", label: "Blog", what: "Posts from people using Nimbotics" },
];

function OfflineBanner() {
  const { error } = useApi<Health>("/api/health", 5000);
  if (!error) return null;
  return <div role="alert" className="border-b border-bad/40 bg-panel px-6 py-3 text-center text-sm text-bad">
    Backend unreachable at <span className="font-mono">{API_BASE}</span>. Start it with <span className="font-mono">make dev</span>;
    this page will reconnect automatically. Nothing on screen is being updated meanwhile.
  </div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/present")) return <>{children}</>;
  // The sign-in pages stand alone: just the logo and the card, no nav or footer.
  if (pathname.startsWith("/signin") || pathname.startsWith("/signup")) return <AuthProvider>{children}</AuthProvider>;
  return <AuthProvider><Shell pathname={pathname}>{children}</Shell></AuthProvider>;
}

function Shell({ pathname, children }: { pathname: string; children: ReactNode }) {
  return <div className="flex min-h-screen flex-col">
    <header className="site-header sticky top-0 z-20">
      {/* Logo left and account right at every width, all three on one centre line and the same height as the nav;
          the nav sits centred, on its own row on narrow screens. */}
      <div className="mx-auto flex min-h-[88px] max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 md:px-8 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <Link href="/" aria-label="nimbotics home" className="flex h-14 shrink-0 items-center text-[30px] leading-none font-semibold lg:text-[38px]">
          <Logo />
        </Link>
        <div className="order-3 flex w-full justify-center lg:order-none lg:w-auto">
          <NavPill items={NAV} pathname={pathname} />
        </div>
        <div className="ml-auto flex items-center gap-2 lg:justify-self-end">
          <UserMenu />
        </div>
      </div>
    </header>
    <OfflineBanner />
    <main key={pathname} data-soft={pathname === "/" ? undefined : ""}
      className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-8 md:px-8">{children}</main>
    <footer className="border-t border-line px-6 py-4 text-center font-mono text-[11px] text-ink-3">
      <Link href="/#how-it-works" className="underline">How it works</Link>
      {" · "}<Link href="/privacy" className="underline">Privacy</Link>
    </footer>
  </div>;
}
