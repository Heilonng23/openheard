import { EnvelopeSimpleIcon, LockSimpleIcon, MagicWandIcon, UserIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, redirect, useLoaderData, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { GoogleIcon } from "@/components/icons";

import { Button } from "@openheard/ui/components/button";
import Logo from "@/components/logo";
import { myWorkspaces } from "@/functions/admin";
import { getUser } from "@/functions/get-user";
import { getWorkspace } from "@/functions/workspace";
import { getWorkspaceMemberCount } from "@/functions/invites";
import { authClient } from "@/lib/auth-client";
import { workspaceUrl } from "@/lib/workspace-url";

type Search = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const user = await getUser();
    if (!user) return;
    if ((search as Search).redirect) throw redirect({ to: (search as Search).redirect! });
    // On the cloud root domain "/" is the landing page, so a signed-in visitor
    // goes to their board (or the create screen) instead of bouncing home.
    const root = await getWorkspace();
    if (!root.marketing) throw redirect({ to: "/" });
    const own = (await myWorkspaces()).filter((w) => w.id !== "default");
    if (own.length === 1) throw redirect({ href: workspaceUrl(own[0]!.id, root.rootDomain, "/dashboard") });
    throw redirect({ to: "/new" });
  },
  loader: () => getWorkspaceMemberCount(),
  head: () => ({ meta: [{ title: "Sign in · feedback" }] }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const root = useLoaderData({ from: "__root__" });
  const search = Route.useSearch();
  const memberCount = Route.useLoaderData();
  const [mode, setMode] = useState<"in" | "up" | "magic">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  const wsName = root.workspace?.name ?? "openheard";
  const hasGoogle = root.googleSignIn;

  async function afterAuth() {
    await router.invalidate();
    if (search.redirect) {
      router.navigate({ to: search.redirect });
      return;
    }
    if (!root.marketing) {
      router.navigate({ to: "/" });
      return;
    }
    try {
      const workspaces = await myWorkspaces();
      const own = workspaces.filter((w) => w.id !== "default");
      if (own.length === 1) {
        window.location.href = workspaceUrl(own[0]!.id, root.rootDomain, "/");
        return;
      }
      router.navigate({ to: "/new" });
    } catch {
      router.navigate({ to: "/new" });
    }
  }

  function onError(err: { error: { message?: string; statusText: string } }) {
    setError(err.error.message || err.error.statusText);
    setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    if (mode === "in") await authClient.signIn.email({ email, password }, { onSuccess: afterAuth, onError });
    else if (mode === "up") await authClient.signUp.email({ name, email, password }, { onSuccess: afterAuth, onError });
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const callbackURL = search.redirect ?? (root.marketing ? "/new" : "/");
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
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-6">
        <Logo size={40} />
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
                setBusy(true);
                const callbackURL = search.redirect ?? (root.marketing ? "/new" : "/");
                authClient.signIn.social({ provider: "google", callbackURL });
              }}
            >
              <GoogleIcon className="mr-1.5 size-4" /> Continue with Google
            </Button>
            <div className="flex w-full items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="font-mono text-[11px] text-faint">or</span>
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
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} autoComplete="email" placeholder="you@company.com" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint disabled:opacity-60" />
              </Field>
              {error ? <p className="text-[13px] text-red-400">{error}</p> : null}
              <Button type="submit" full arrow size="lg" disabled={busy} className="mt-1">
                {busy ? "Sending…" : "Email me a link"}
              </Button>
            </form>
          )
        ) : (
          <form onSubmit={submit} className="flex w-full flex-col gap-2.5">
            {mode === "up" ? (
              <Field icon={<UserIcon className="size-[15px]" />}>
                <input value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} autoComplete="name" placeholder="Your name" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint disabled:opacity-60" />
              </Field>
            ) : null}
            <Field icon={<EnvelopeSimpleIcon className="size-[15px]" />}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} autoComplete="email" placeholder="you@company.com" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint disabled:opacity-60" />
            </Field>
            <Field icon={<LockSimpleIcon className="size-[15px]" />}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={busy}
                minLength={8}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                placeholder="Password"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint disabled:opacity-60"
              />
            </Field>
            {error ? <p className="text-[13px] text-red-400">{error}</p> : null}
            <Button type="submit" full arrow size="lg" disabled={busy} className="mt-1">
              {busy ? (mode === "in" ? "Signing in…" : "Creating account…") : mode === "in" ? "Sign in" : "Create account"}
            </Button>
            {mode === "in" ? (
              <Link to="/reset-password" className="self-end text-xs text-faint hover:text-foreground">
                Forgot password?
              </Link>
            ) : null}
          </form>
        )}

        <div className="flex w-full items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] text-faint">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="flex w-full flex-col gap-2">
          {mode !== "magic" ? (
            <Button variant="secondary" full size="lg" disabled={busy} onClick={() => { setError(""); setMode("magic"); }} className="font-semibold">
              <MagicWandIcon className="mr-1.5 size-4" /> Email me a link
            </Button>
          ) : null}
          <Button variant="secondary" full size="lg" disabled={busy} onClick={() => { setError(""); setMode(mode === "up" ? "in" : mode === "magic" ? "in" : "up"); }} className="font-semibold">
            {mode === "up" ? "I already have an account" : mode === "magic" ? "Sign in with password" : "Create an account"}
          </Button>
        </div>

        {memberCount === 0 ? (
          <p className="text-center text-xs text-faint">The first account on a fresh install becomes the admin.</p>
        ) : null}
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
