import { EnvelopeSimpleIcon, LockSimpleIcon, MagicWandIcon, UserIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@openheard/ui/lib/utils";

import { Button } from "@openheard/ui/components/button";
import { GoogleIcon } from "@/components/icons";
import { authClient } from "@/lib/auth-client";

function Field({ icon, children, invalid }: { icon: React.ReactNode; children: React.ReactNode; invalid?: boolean }) {
  return (
    <label className={cn("flex h-10 items-center gap-2.5 rounded-lg border bg-card px-3 text-faint transition-colors focus-within:ring-1", invalid ? "animate-shake border-red-500/70 focus-within:border-red-500 focus-within:ring-red-500/40 motion-reduce:animate-none" : "border-input focus-within:border-ring/60 focus-within:ring-ring/40")}>
      {icon}
      {children}
    </label>
  );
}

export function AuthForm({
  wsName,
  hasGoogle,
  callbackURL,
  onSuccess,
  showFirstAccountHint = false,
  onGoogleClick,
}: {
  wsName: string;
  hasGoogle: boolean;
  callbackURL: string;
  onSuccess: () => void;
  showFirstAccountHint?: boolean;
  onGoogleClick?: () => void;
}) {
  const [mode, setMode] = useState<"in" | "up" | "magic">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  function onError(err: { error: { message?: string; statusText: string } }) {
    setError(err.error.message || err.error.statusText);
    setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    if (mode === "in") await authClient.signIn.email({ email, password }, { onSuccess, onError });
    else if (mode === "up") await authClient.signUp.email({ name, email, password }, { onSuccess, onError });
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    await authClient.signIn.magicLink(
      { email, callbackURL },
      {
        onSuccess: () => {
          setMagicSent(true);
          setBusy(false);
        },
        onError,
      },
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
          {mode === "up" ? "Create your account" : `Sign in to ${wsName}`}
        </h1>
        <p className="text-sm text-muted-foreground">Vote and comment as yourself.</p>
      </div>

      {hasGoogle ? (
        <>
          <Button
            variant="secondary"
            full
            size="lg"
            disabled={busy}
            className="font-semibold"
            onClick={() => {
              onGoogleClick?.();
              setBusy(true);
              authClient.signIn.social({ provider: "google", callbackURL });
            }}
          >
            <GoogleIcon className="mr-1.5 size-4" /> Continue with Google
          </Button>
          <div className="flex w-full items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-faint">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      {mode === "magic" ? (
        magicSent ? (
          <div className="flex w-full flex-col items-center gap-3 rounded-lg border bg-card px-5 py-6 text-center">
            <MagicWandIcon className="size-6 text-faint" />
            <p className="text-sm">Check your email for a sign-in link.</p>
            <button type="button" onClick={() => { setMagicSent(false); setMode("in"); }} className="text-xs text-faint hover:text-foreground">
              Back to password sign-in
            </button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="flex w-full flex-col gap-2.5">
            <Field icon={<EnvelopeSimpleIcon className="size-[15px]" />}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} autoComplete="email" placeholder="you@company.com" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint disabled:opacity-60" />
            </Field>
            {error ? <p role="alert" className="text-[13px] text-red-400">{error}</p> : null}
            <Button type="submit" full arrow size="lg" disabled={busy} className="mt-1">
              {busy ? "Sending…" : "Email me a link"}
            </Button>
            <button type="button" onClick={() => { setError(""); setMode("in"); }} className="self-center text-xs text-faint hover:text-foreground">
              Sign in with password
            </button>
          </form>
        )
      ) : (
        <form onSubmit={submit} className="flex w-full flex-col gap-2.5">
          {mode === "up" ? (
            <Field icon={<UserIcon className="size-[15px]" />}>
              <input value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} autoComplete="name" placeholder="Your name" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint disabled:opacity-60" />
            </Field>
          ) : null}
          <Field icon={<EnvelopeSimpleIcon className="size-[15px]" />} invalid={!!error}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} autoComplete="email" placeholder="you@company.com" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint disabled:opacity-60" />
          </Field>
          <Field icon={<LockSimpleIcon className="size-[15px]" />} invalid={!!error}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
              minLength={8}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              placeholder="Password"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint disabled:opacity-60"
            />
          </Field>
          {error ? <p role="alert" className="text-[13px] text-red-400">{error}</p> : null}
          <Button type="submit" full arrow size="lg" disabled={busy} className="mt-1">
            {busy ? (mode === "in" ? "Signing in…" : "Creating account…") : mode === "in" ? "Sign in" : "Create account"}
          </Button>
          <div className="flex items-center justify-between">
            {mode === "in" ? (
              <Link to="/reset-password" className="text-xs text-faint hover:text-foreground">
                Forgot password?
              </Link>
            ) : <span />}
            <button type="button" onClick={() => { setError(""); setMode("magic"); }} className="text-xs text-faint hover:text-foreground">
              Email me a link instead
            </button>
          </div>
        </form>
      )}

      <button
        type="button"
        onClick={() => { setError(""); setMode(mode === "up" ? "in" : "up"); }}
        className="text-xs text-faint hover:text-foreground"
      >
        {mode === "up" ? "I already have an account" : "Create an account"}
      </button>

      {showFirstAccountHint ? (
        <p className="text-center text-xs text-faint">The first account on a fresh install becomes the admin.</p>
      ) : null}
    </div>
  );
}
