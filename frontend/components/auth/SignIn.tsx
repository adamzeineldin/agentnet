"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { PROVIDER_LABEL, useAuth } from "@/lib/auth";
import type { AuthProvider } from "@/lib/types";

function ProviderIcon({ provider }: { provider: AuthProvider }) {
  return provider === "github" ? (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

/** Modal with one button per configured provider. Opened by the header button or by ActButton. */
export function SignInDialog() {
  const { config, promptOpen, setPromptOpen, signInUrl } = useAuth();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (promptOpen && !dialog.open) dialog.showModal();
    if (!promptOpen && dialog.open) dialog.close();
  }, [promptOpen]);
  return (
    <dialog ref={ref} aria-labelledby="signin-title" onClose={() => setPromptOpen(false)}
      onClick={(e) => e.target === ref.current && setPromptOpen(false)}
      className="menu-pop m-auto w-[min(92vw,380px)] rounded-[20px] border border-line bg-panel p-6 text-ink shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm">
      <h2 id="signin-title" className="text-lg font-medium">Sign in to run simulations</h2>
      <p className="mt-2 text-sm text-ink-2">
        Anyone can look around. Starting runs, publishing skills and adding robots needs an account, so the shared
        simulator isn&apos;t overloaded. We only keep your name and picture.
      </p>
      <div className="mt-5 space-y-2">
        {config?.providers.map((p) => (
          <a key={p} href={signInUrl(p)} className="pill w-full justify-center py-2.5 hover:bg-panel-2">
            <ProviderIcon provider={p} /> Continue with {PROVIDER_LABEL[p]}
          </a>
        ))}
      </div>
      <button type="button" onClick={() => setPromptOpen(false)} className="mt-4 w-full text-center text-xs text-ink-3 hover:text-ink">
        Not now
      </button>
    </dialog>
  );
}

/** Header control: avatar + sign out when signed in, a sign-in button otherwise; nothing when sign-in is off. */
export function UserMenu() {
  const { config, user, signOut, setPromptOpen } = useAuth();
  const [open, setOpen] = useState(false);
  if (!config || config.providers.length === 0) return null;
  if (!user) {
    return <button type="button" onClick={() => setPromptOpen(true)} className="pill py-1.5 text-xs">Sign in</button>;
  }
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} aria-label={`Signed in as ${user.name}`} onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1 text-xs hover:border-line-strong">
        {user.avatar_url
          // eslint-disable-next-line @next/next/no-img-element -- provider avatar URL
          ? <img src={user.avatar_url} alt="" className="size-6 rounded-full" referrerPolicy="no-referrer" />
          : <span className="grid size-6 place-items-center rounded-full bg-panel-2">{user.name.slice(0, 1)}</span>}
        <span className="max-w-24 truncate">{user.name}</span>
      </button>
      {open && (
        <div className="menu-pop absolute right-0 z-30 mt-2 w-48 rounded-2xl border border-line bg-panel p-2 text-sm shadow-xl">
          <p className="px-2 py-1 text-xs text-ink-3">Signed in with {PROVIDER_LABEL[user.provider]}</p>
          <button type="button" onClick={() => { setOpen(false); void signOut(); }}
            className="w-full rounded-xl px-2 py-1.5 text-left hover:bg-panel-2">Sign out</button>
        </div>
      )}
    </div>
  );
}

/** A button that runs its action when the visitor may act, and asks them to sign in otherwise. */
export function ActButton({ onClick, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { canAct, setPromptOpen } = useAuth();
  return (
    <button type="button" {...rest} title={canAct ? rest.title : "Sign in to run this"}
      onClick={(e) => (canAct ? onClick?.(e) : setPromptOpen(true))}>
      {children}{!canAct && !rest.disabled && <span className="ml-1.5 text-[11px] opacity-70">· sign in</span>}
    </button>
  );
}
