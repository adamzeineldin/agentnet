"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";

export type NavItem = { href: string; label: string; what: string };
type Thumb = { left: number; width: number };

function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** The main navigation: a recessed track with a raised thumb that slides to the current page. */
export function NavPill({ items, pathname }: { items: readonly NavItem[]; pathname: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<Thumb | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const link = track.querySelector<HTMLElement>('[aria-current="page"]');
      setThumb(link ? { left: link.offsetLeft, width: link.offsetWidth } : null);
      link?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [pathname]);

  return <nav aria-label="Main navigation" className="neu-track min-w-0 max-w-full">
    <div ref={trackRef} className="relative flex overflow-x-auto [scrollbar-width:none]">
      {thumb && <span aria-hidden="true" className="neu-thumb absolute inset-y-0"
        style={{ left: thumb.left, width: thumb.width }} />}
      {items.map((item) => {
        const active = isActive(item.href, pathname);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} title={item.what}
          className={`nav-link relative flex h-11 shrink-0 items-center rounded-full px-6 text-[15px] ${active ? "text-ink" : "text-ink-3 hover:text-ink"}`}>
          {item.label}
        </Link>;
      })}
    </div>
  </nav>;
}
