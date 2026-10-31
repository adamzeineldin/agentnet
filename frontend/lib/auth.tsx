"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, apiUrl } from "./api";
import type { AuthConfig, AuthProvider, PublicUser } from "./types";

export const PROVIDER_LABEL: Record<AuthProvider, string> = { google: "Google", github: "GitHub" };

interface AuthState {
  config: AuthConfig | null;
  user: PublicUser | null;
  /** True when this visitor may start runs: signed in, or sign-in is off on this server. */
  canAct: boolean;
  signInUrl: (provider: AuthProvider) => string;
  signOut: () => Promise<void>;
  promptOpen: boolean;
  setPromptOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Loads the server's sign-in setup and the current user once for the whole site. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    apiFetch<AuthConfig>("/api/auth/config").then(setConfig).catch(() => setConfig(null));
    apiFetch<PublicUser | null>("/api/auth/me").then(setUser).catch(() => setUser(null));
  }, []);

  const signInUrl = useCallback((provider: AuthProvider) => {
    const next = typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
    return apiUrl(`/api/auth/login/${provider}?next=${encodeURIComponent(next)}`);
  }, []);

  const signOut = useCallback(async () => {
    await apiFetch<null>("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
  }, []);

  const canAct = !config?.required || user !== null;
  return (
    <AuthContext.Provider value={{ config, user, canAct, signInUrl, signOut, promptOpen, setPromptOpen }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
