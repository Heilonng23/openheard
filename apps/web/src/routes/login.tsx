import { EnvelopeSimpleIcon, LockSimpleIcon, UserIcon } from "@phosphor-icons/react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@openheard/ui/components/button";
import Logo from "@/components/logo";
import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (await getUser()) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Sign in · feedback" }] }),
  component: LoginPage,
});

// Email and password, styled like the magic link frame. Magic links land once
// an email provider is wired up; the shape of this page does not change.
function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const opts = {
      onSuccess: async () => {
        await router.invalidate();
        router.navigate({ to: "/" });
      },
      onError: (err: { error: { message?: string; statusText: string } }) => {
        toast.error(err.error.message || err.error.statusText);
      },
    };
    if (mode === "in") await authClient.signIn.email({ email, password }, opts);
    else await authClient.signUp.email({ name, email, password }, opts);
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-6">
        <Logo size={40} />
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{mode === "in" ? "Sign in to openheard" : "Create your account"}</h1>
          <p className="text-sm text-muted-foreground">Vote and comment as yourself.</p>
        </div>

        <form onSubmit={submit} className="flex w-full flex-col gap-2.5">
          {mode === "up" ? (
            <Field icon={<UserIcon className="size-[15px]" />}>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Your name" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
            </Field>
          ) : null}
          <Field icon={<EnvelopeSimpleIcon className="size-[15px]" />}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@company.com" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
          </Field>
          <Field icon={<LockSimpleIcon className="size-[15px]" />}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              placeholder="Password"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
          </Field>
          <Button type="submit" full arrow size="lg" disabled={busy} className="mt-1">
            {busy ? "One moment" : mode === "in" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="flex w-full items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] text-faint">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="secondary" full size="lg" onClick={() => setMode(mode === "in" ? "up" : "in")} className="font-semibold">
          {mode === "in" ? "Create an account" : "I already have an account"}
        </Button>

        <p className="text-center text-xs text-faint">The first account on a fresh install becomes the admin.</p>
      </div>
    </main>
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
