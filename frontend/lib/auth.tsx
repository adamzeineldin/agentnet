"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, apiUrl, registerAccount, signInWithPassword } from "./api";
import type { AccountKind, AuthConfig, AuthProvider, PublicUser } from "./types";

export const PROVIDER_LABEL: Record<AccountKind, string> = { google: "Google", github: "GitHub", email: "email" };

/** Only same-site paths are followed after signing in (mirrors the server's safe_next); anything else goes home. */
export function safeNext(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  return path.startsWith("/signin") || path.startsWith("/signup") ? "/" : path;
}

/** "/signin?next=/lab" (or /signup): the sign-in pages bring people back where they were. */
export function authHref(page: "signin" | "signup", next: string): string {
  const back = safeNext(next);
  return back === "/" ? `/${page}` : `/${page}?next=${encodeURIComponent(back)}`;
}

function here(): string {
  return typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
}

interface AuthState {
  config: AuthConfig | null;
  user: PublicUser | null;
  /** True when this visitor may start runs: signed in, or sign-in is off on this server. */
  canAct: boolean;
  /** Where the provider's sign-in starts; it comes back to `next`. */
  providerUrl: (provider: AuthProvider, next: string) => string;
  signIn: (email: string, password: string) => Promise<PublicUser>;
  register: (name: string, email: string, password: string) => Promise<PublicUser>;
  signOut: () => Promise<void>;
  /** Send the visitor to the sign-in page, to come back here afterwards. */
  requestSignIn: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Loads the server's sign-in setup and the current user once for the whole site. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const router = useRouter();

  useEffect(() => {
    apiFetch<AuthConfig>("/api/auth/config").then(setConfig).catch(() => setConfig(null));
    apiFetch<PublicUser | null>("/api/auth/me").then(setUser).catch(() => setUser(null));
  }, []);

  const providerUrl = useCallback((provider: AuthProvider, next: string) =>
    apiUrl(`/api/auth/login/${provider}?next=${encodeURIComponent(safeNext(next))}`), []);

  const signIn = useCallback(async (email: string, password: string) => {
    const signedIn = await signInWithPassword(email, password);
    setUser(signedIn);
    return signedIn;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const made = await registerAccount(name, email, password);
    setUser(made);
    return made;
  }, []);

  const signOut = useCallback(async () => {
    await apiFetch<null>("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
  }, []);

  const requestSignIn = useCallback(() => router.push(authHref("signin", here())), [router]);

  const canAct = !config?.required || user !== null;
  return (
    <AuthContext.Provider value={{ config, user, canAct, providerUrl, signIn, register, signOut, requestSignIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
