import { EnvelopeSimpleIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@openheard/ui/components/button";
import Logo from "@/components/logo";
import { authClient } from "@/lib/auth-client";

const searchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Reset password · feedback" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error: searchError } = useSearch({ from: "/reset-password" });
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-6">
        <Logo size={32} />
        {searchError ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Link expired</h1>
            <p className="text-sm text-muted-foreground">This reset link is no longer valid. Request a new one.</p>
            <Link to="/reset-password" className="mt-2 text-sm font-medium hover:underline">
              Try again
            </Link>
          </div>
        ) : token ? (
          <NewPasswordForm token={token} />
        ) : (
          <RequestForm />
        )}
      </div>
    </main>
  );
}

function RequestForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    await authClient.requestPasswordReset(
      { email, redirectTo: "/reset-password" },
      {
        onSuccess: () => setSent(true),
        onError: (err: { error: { message?: string; statusText: string } }) => {
          setError(err.error.message || err.error.statusText);
          setBusy(false);
        },
      },
    );
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Check your email</h1>
        <p className="text-sm text-muted-foreground">If an account with that email exists, we sent a reset link.</p>
        <Link to="/login" className="mt-2 text-sm text-faint hover:text-foreground">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Reset your password</h1>
        <p className="text-sm text-muted-foreground">Enter your email and we'll send a reset link.</p>
      </div>
      <form onSubmit={submit} className="flex w-full flex-col gap-2.5">
        <Field icon={<EnvelopeSimpleIcon className="size-[15px]" />}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} autoComplete="email" placeholder="you@company.com" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint disabled:opacity-60" />
        </Field>
        {error ? <p className="text-[13px] text-red-400">{error}</p> : null}
        <Button type="submit" full arrow size="lg" disabled={busy} className="mt-1">
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <Link to="/login" className="text-sm text-faint hover:text-foreground">
        Back to sign in
      </Link>
    </>
  );
}

function NewPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    await authClient.resetPassword(
      { newPassword: password, token },
      {
        onSuccess: () => setDone(true),
        onError: (err: { error: { message?: string; statusText: string } }) => {
          setError(err.error.message || err.error.statusText);
          setBusy(false);
        },
      },
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Password updated</h1>
        <p className="text-sm text-muted-foreground">You can now sign in with your new password.</p>
        <Link to="/login" className="mt-2 text-sm font-medium hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Set a new password</h1>
        <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
      </div>
      <form onSubmit={submit} className="flex w-full flex-col gap-2.5">
        <Field icon={<LockSimpleIcon className="size-[15px]" />}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} minLength={8} autoComplete="new-password" placeholder="New password" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint disabled:opacity-60" />
        </Field>
        {error ? <p className="text-[13px] text-red-400">{error}</p> : null}
        <Button type="submit" full arrow size="lg" disabled={busy} className="mt-1">
          {busy ? "Updating…" : "Set new password"}
        </Button>
      </form>
    </>
  );
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex h-10 items-center gap-2.5 rounded-lg border border-input bg-card px-3 text-faint transition-colors focus-within:border-ring/60 focus-within:ring-1 focus-within:ring-ring/40">
      {icon}
      {children}
    </label>
  );
}
