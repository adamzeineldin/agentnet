"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { API_BASE } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { AuthProvider } from "@/lib/auth";
import type { Health } from "@/lib/types";
import { SignInDialog, UserMenu } from "./auth/SignIn";

/** Five places. How it works lives on the home page, below the hero. */
export const NAV = [
  { href: "/", label: "Home", what: "What Nimbotics is, and how it works" },
  { href: "/transfer", label: "Try it", what: "Teach one robot a task, then watch another robot learn it" },
  { href: "/robots", label: "Robots", what: "The robot arms, and adding more" },
  { href: "/skills", label: "Skills", what: "Every task the robots have learned, and which robot can do what" },
  { href: "/real", label: "Real data", what: "Motions recorded on a real robot, replayed in simulation" },
  { href: "/evaluation", label: "Results", what: "Does sharing help? Measured, with every run" },
  { href: "/history", label: "All runs", what: "Every simulation, running or finished: watch it step by step" },
];

function subscribeTheme(onChange: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key !== "nimbotics-theme" && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    onChange();
  };
  window.addEventListener("nimbotics-theme", onChange);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener("nimbotics-theme", onChange);
    window.removeEventListener("storage", sync);
  };
}

function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme,
    () => document.documentElement.dataset.theme === "dark" ? "dark" : "light", () => "light");
  return <button type="button" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
    className="border-l border-line px-3 py-2 text-xs text-ink-2 hover:text-ink"
    onClick={() => {
      const next = theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("nimbotics-theme", next); } catch { /* Theme still works without storage. */ }
      window.dispatchEvent(new Event("nimbotics-theme"));
    }}>{theme === "light" ? "Dark" : "Light"}</button>;
}

function HealthIndicator() {
  const { data, error } = useApi<Health>("/api/health", 5000);
  const tone = error ? "bg-bad" : data ? "bg-good" : "bg-ink-3";
  return <div className="flex items-center gap-2 font-mono text-[11px] text-ink-3" role="status">
    <span className={`size-1.5 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
    <span title={data ? `MuJoCo ${data.versions.mujoco} · Python ${data.versions.python}` : undefined}>
      {error ? "backend offline" : data ? "backend live" : "connecting"}
    </span>
    {data && <span className="hidden max-w-48 truncate border-l border-line pl-2 xl:inline"
      title="Strategy reasoning provider. Offline = deterministic planner, no model calls.">{data.reasoning.label}</span>}
  </div>;
}

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
  return <AuthProvider><Shell pathname={pathname}>{children}</Shell><SignInDialog /></AuthProvider>;
}

function Shell({ pathname, children }: { pathname: string; children: ReactNode }) {
  return <div className="flex min-h-screen flex-col">
    <header className="sticky top-0 z-20 border-b border-line bg-panel">
      <div className="flex min-h-14 flex-wrap items-center gap-x-6 px-4 lg:px-8">
        <Link href="/" aria-label="nimbotics home" className="flex h-14 shrink-0 items-center gap-2.5 text-base font-semibold">
          <span className="size-[11px] bg-ink" aria-hidden="true" />nimbotics
        </Link>
        <nav aria-label="Main navigation" className="order-3 flex w-full overflow-x-auto text-[13px] lg:order-none lg:w-auto">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} title={item.what}
              className={`nav-link flex h-12 shrink-0 items-center px-3 lg:h-14 ${active ? "text-ink shadow-[inset_0_-2px_0_var(--ink)]" : "text-ink-3 hover:text-ink"}`}>
              {item.label}
            </Link>;
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <HealthIndicator /><UserMenu /><ThemeToggle />
          <Link href="/present" className="hidden border border-line-strong px-3 py-1.5 text-xs hover:border-ink sm:block">▶ Present</Link>
        </div>
      </div>
    </header>
    <OfflineBanner />
    <main key={pathname} data-soft={pathname === "/" ? undefined : ""}
      className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-8 md:px-8">{children}</main>
    <footer className="border-t border-line px-6 py-4 text-center font-mono text-[11px] text-ink-3">
      Results are MuJoCo simulation; real-robot paths are recorded by the DROID dataset; controller checks run on
      URSim software. Nothing here ran on a physical arm. <Link href="/#how-it-works" className="underline">How it works</Link>
    </footer>
  </div>;
}
