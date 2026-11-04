"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authHref, safeNext, useAuth } from "@/lib/auth";
import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/types";
import { Logo } from "../Logo";
import { Loading } from "../ui";
import { AuthCard } from "./AuthCard";
import { ContinueButton, Field, FormError, PasswordField } from "./AuthFields";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LINK = "font-semibold text-accent hover:underline";

/** The page to return to, and a redirect there once the visitor is signed in (or arrives signed in). */
function useReturn(): { next: string; done: () => void } {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const next = safeNext(params.get("next"));
  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);
  return { next, done: () => router.replace(next) };
}

/** The wordmark in a line of text: a touch larger than the words around it, sitting on the same baseline. */
function InlineLogo() {
  return <Logo className="align-baseline text-[1.12em] font-semibold text-ink" />;
}

/** "401: Wrong email or password." → "Wrong email or password." */
const plain = (e: unknown) => (e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Something went wrong; try again.");

function Unavailable() {
  return <p className="rounded-2xl bg-panel-2 px-4 py-3 text-sm text-ink-2">Email accounts aren&apos;t switched on for this server yet.</p>;
}

/** Sign in: email first, then the password. */
export function SignInPage() {
  const { config, signIn } = useAuth();
  const { next, done } = useReturn();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === "email") {
      if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");
      return setStep("password");
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      done();
    } catch (err) {
      setError(plain(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Log in to your account" next={next}
      footer={<>New to <InlineLogo />? <Link href={authHref("signup", next)} className={LINK}>Create an account</Link></>}>
      {!config ? <Loading /> : !config.password ? (!config.providers.length && <Unavailable />) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          {step === "email" ? (
            <Field id="signin-email" label="Email address" type="email" autoComplete="email" autoFocus required
              placeholder="Enter your email address" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
          ) : (
            <>
              <p className="flex items-center justify-between gap-3 rounded-full bg-panel-2 px-5 py-2.5 text-left text-sm">
                <span className="min-w-0 truncate text-ink">{email.trim()}</span>
                <button type="button" onClick={() => { setStep("email"); setPassword(""); setError(null); }}
                  className="shrink-0 text-accent hover:underline">Change</button>
              </p>
              <PasswordField id="signin-password" label="Password" autoComplete="current-password" autoFocus required
                placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={PASSWORD_MAX} />
            </>
          )}
          <FormError message={error} />
          <ContinueButton busy={busy} disabled={step === "password" && password.length === 0} />
        </form>
      )}
    </AuthCard>
  );
}

/** Create an account: email and password, then the name shown on your posts and runs. */
export function SignUpPage() {
  const { config, register } = useAuth();
  const { next, done } = useReturn();
  const [step, setStep] = useState<"account" | "name">("account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === "account") {
      if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");
      if (password.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters for your password.`);
      return setStep("name");
    }
    if (!name.trim()) return setError("Enter the name to show on your posts.");
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      done();
    } catch (err) {
      setError(plain(err));
      setBusy(false);
      // A taken email is fixed on the first step.
      if (err instanceof Error && err.message.startsWith("409")) setStep("account");
    }
  }

  return (
    <AuthCard title={step === "account" ? "Create your account" : "What should we call you?"} next={next} providers={step === "account"}
      footer={<>Already have an account? <Link href={authHref("signin", next)} className={LINK}>Sign in</Link></>}>
      {!config ? <Loading /> : !config.password ? (!config.providers.length && <Unavailable />) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          {step === "account" ? (
            <>
              <Field id="signup-email" label="Email address" type="email" autoComplete="email" autoFocus required
                placeholder="Enter your email address" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
              <PasswordField id="signup-password" label="Password" autoComplete="new-password" required
                placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)}
                maxLength={PASSWORD_MAX} hint={`At least ${PASSWORD_MIN} characters`} />
            </>
          ) : (
            <Field id="signup-name" label="Your name" autoComplete="name" autoFocus required maxLength={NAME_MAX}
              placeholder="Shown on your posts and runs" value={name} onChange={(e) => setName(e.target.value)}
              hint="Your email stays private." />
          )}
          <FormError message={error} />
          <ContinueButton busy={busy} label={step === "account" ? "Continue" : "Create account"} />
          {step === "name" && (
            <button type="button" onClick={() => { setStep("account"); setError(null); }} className="text-sm text-ink-3 hover:text-ink">← Back</button>
          )}
        </form>
      )}
    </AuthCard>
  );
}
