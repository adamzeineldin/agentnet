import Link from "next/link";

/** The four hands-on pages and how they relate, with the current one marked. Answers "which page do I want?". */
const PAGES = [
  { href: "/robots", n: "1", label: "Robots", what: "Meet the arms. Add more." },
  { href: "/transfer", n: "2", label: "Transfer Lab", what: "One arm learns, another adapts it." },
  { href: "/skills", n: "3", label: "Skills", what: "What they learned, kept as proof." },
  { href: "/real", n: "+", label: "Real Data", what: "Same idea, with real recordings." },
] as const;

export function PageMap({ here }: { here: string }) {
  return (
    <nav aria-label="Where this page fits" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {PAGES.map((p) => {
        const current = p.href === here;
        return (
          <Link key={p.href} href={p.href} aria-current={current ? "page" : undefined}
            className={`soft-card flex items-start gap-3 px-3.5 py-2.5 ${current ? "border-accent bg-panel" : "opacity-80 hover:opacity-100"}`}>
            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] ${current ? "bg-accent text-bg" : "bg-panel-2 text-ink-3"}`}>{p.n}</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{p.label}{current && <span className="ml-1.5 text-[11px] font-normal text-accent">you are here</span>}</span>
              <span className="block text-xs text-ink-3">{p.what}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
