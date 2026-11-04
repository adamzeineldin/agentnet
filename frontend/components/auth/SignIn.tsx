"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { PROVIDER_LABEL, useAuth } from "@/lib/auth";
import type { AuthProvider, PublicUser } from "@/lib/types";

export function ProviderIcon({ provider, large = false }: { provider: AuthProvider; large?: boolean }) {
  const size = large ? "size-5" : "size-4";
  return provider === "github" ? (
    <svg viewBox="0 0 16 16" className={size} aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 18 18" className={size} aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function Avatar({ user, size }: { user: PublicUser; size: string }) {
  return user.avatar_url
    // eslint-disable-next-line @next/next/no-img-element -- provider avatar URL
    ? <img src={user.avatar_url} alt="" className={`${size} shrink-0 rounded-full`} referrerPolicy="no-referrer" />
    : <span className={`${size} grid shrink-0 place-items-center rounded-full bg-panel-2 text-xs`}>{user.name.slice(0, 1)}</span>;
}

/** Top-right account control: a sign-in button, or the user's picture and name with a small profile menu. */
export function UserMenu() {
  const { config, user, signOut, requestSignIn } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  // Keep the slot's size while the sign-in setup loads, so the header doesn't jump.
  if (!config) return <span aria-hidden="true" className="h-14 w-36" />;
  if (!user) {
    // Same height as the nav track (h-14), solid ink for contrast; it opens the sign-in page.
    return <button type="button" onClick={requestSignIn}
      className="inline-flex h-14 items-center rounded-full bg-ink px-8 text-[15px] font-medium text-bg shadow-[0_8px_20px_-10px_rgba(0,0,0,.55)] transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-ink/85 active:translate-y-0">
      Sign in
    </button>;
  }
  const item = "block w-full rounded-xl px-2.5 py-1.5 text-left hover:bg-panel-2";
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="menu" aria-label={`Signed in as ${user.name}`} onClick={() => setOpen((o) => !o)}
        className="neu-button h-14 gap-2.5 pr-6 pl-2.5 text-[15px]">
        <Avatar user={user} size="size-9" />
        <span className="max-w-36 truncate">{user.name}</span>
      </button>
      {open && (
        <div role="menu" className="menu-pop absolute right-0 z-30 mt-2 w-60 rounded-2xl border border-line bg-panel p-2 text-sm shadow-xl">
          <div className="flex items-center gap-3 px-2.5 pt-1.5 pb-3">
            <Avatar user={user} size="size-9" />
            <div className="min-w-0">
              <p className="truncate font-medium">{user.name}</p>
              <p className="text-xs text-ink-3">Signed in with {PROVIDER_LABEL[user.provider]}</p>
            </div>
          </div>
          <div className="border-t border-line pt-1.5">
            <Link role="menuitem" href="/lab" onClick={() => setOpen(false)} className={item}>Open the Lab</Link>
            <Link role="menuitem" href={`/blog?author=${encodeURIComponent(user.user_id)}`} onClick={() => setOpen(false)} className={item}>Your posts</Link>
            <Link role="menuitem" href="/blog?write=1" onClick={() => setOpen(false)} className={item}>Write a post</Link>
            <button role="menuitem" type="button" onClick={() => { setOpen(false); void signOut(); }} className={`${item} text-ink-2`}>Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A button that runs its action when the visitor may act, and asks them to sign in otherwise. */
export function ActButton({ onClick, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { canAct, requestSignIn } = useAuth();
  return (
    <button type="button" {...rest} title={canAct ? rest.title : "Sign in to run this"}
      onClick={(e) => (canAct ? onClick?.(e) : requestSignIn())}>
      {children}{!canAct && !rest.disabled && <span className="ml-1.5 text-[11px] opacity-70">· sign in</span>}
    </button>
  );
}
