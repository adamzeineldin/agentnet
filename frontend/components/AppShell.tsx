"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { API_BASE } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { Health } from "@/lib/types";
import { Badge } from "./ui";

const NAV: { href: string; label: string; ready: boolean }[] = [
  { href: "/", label: "Overview", ready: true },
  { href: "/robots", label: "Robot Fleet", ready: true },
  { href: "/skills", label: "Skill Library", ready: true },
  { href: "/transfer", label: "Transfer Lab", ready: true },
  { href: "/history", label: "Run History", ready: true },
  { href: "/evaluation", label: "Evaluation", ready: true },
];

function HealthIndicator() {
  const { data, error } = useApi<Health>("/api/health", 5000);
  if (error) return <Badge tone="bad">● backend offline</Badge>;
  if (!data) return <Badge>● connecting</Badge>;
  return (
    <div className="flex items-center gap-2">
      <Badge tone="good" title={`MuJoCo ${data.versions.mujoco} · Python ${data.versions.python}`}>
        ● backend live · MuJoCo {data.versions.mujoco}
      </Badge>
      <Badge tone={data.reasoning.mode === "offline" ? "warn" : "accent"}
        title="Strategy reasoning provider. Offline = deterministic planner, no model calls.">
        {data.reasoning.label}
      </Badge>
    </div>
  );
}

function OfflineBanner() {
  const { error } = useApi<Health>("/api/health", 5000);
  if (!error) return null;
  return (
    <div role="alert" className="border-b border-bad/40 bg-bad/10 px-6 py-2 text-center text-sm text-bad">
      Backend unreachable at <span className="font-mono">{API_BASE}</span>. Start it with <span className="font-mono">make dev</span>;
      this page will reconnect automatically. Nothing on screen is being updated meanwhile.
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/present")) return <>{children}</>; // full-screen presentation, no chrome
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md border border-accent-dim bg-accent/10 font-mono text-xs text-accent">AN</span>
            <span className="font-semibold tracking-tight">AgentNet</span>
            <span className="hidden text-xs text-ink-3 sm:inline">Control Center</span>
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              if (!item.ready) {
                return (
                  <span key={item.href} title="Not built yet (later milestone)"
                    className="cursor-not-allowed rounded-md px-3 py-1.5 text-ink-3/60">
                    {item.label}
                  </span>
                );
              }
              return (
                <Link key={item.href} href={item.href}
                  className={`rounded-md px-3 py-1.5 transition-colors ${active ? "bg-panel-2 text-ink" : "text-ink-2 hover:text-ink"}`}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <HealthIndicator />
            <Link href="/present" className="rounded-md border border-accent-dim px-3 py-1.5 text-sm text-accent hover:bg-accent/10">
              ▶ Present
            </Link>
          </div>
        </div>
      </header>
      <OfflineBanner />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">{children}</main>
      <footer className="border-t border-line px-6 py-3 text-center text-[11px] text-ink-3">
        All robot results are MuJoCo simulation only — not physical-world verification.
      </footer>
    </div>
  );
}
