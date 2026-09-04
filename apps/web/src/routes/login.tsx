import { Button } from "@openheard/ui/components/button";
import { Input } from "@openheard/ui/components/input";
import { Label } from "@openheard/ui/components/label";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import Logo from "@/components/logo";
import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (await getUser()) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Sign in · feedback" }] }),
  component: LoginPage,
});

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
      <div className="flex w-full max-w-[360px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <Logo size={36} />
          <h1 className="text-lg font-semibold">{mode === "in" ? "Welcome back" : "Create an account"}</h1>
        </div>
        <div className="flex gap-0.5 rounded-md border bg-card p-[3px]">
          {(["in", "up"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn("flex-1 rounded-[5px] py-1.5 text-xs font-medium text-muted-foreground transition-colors", mode === m && "bg-accent text-foreground")}
            >
              {m === "in" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          {mode === "up" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} />
          </div>
          <Button type="submit" className="mt-1 h-9" disabled={busy}>
            {busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">The first account on a fresh install becomes the admin.</p>
      </div>
    </main>
  );
}
