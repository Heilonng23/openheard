import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, redirect, useLoaderData, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@openheard/ui/components/button";
import { cn } from "@openheard/ui/lib/utils";
import Logo from "@/components/logo";
import { saveWorkspace } from "@/functions/settings";
import { getWorkspace } from "@/functions/workspace";
import { isAdmin } from "@/lib/session";

// One screen between sign-up and the board. Name the board, pick the accent,
// then copy the link. The workspace already exists; this only fills it in.
export const Route = createFileRoute("/welcome")({
  beforeLoad: async () => {
    const root = await getWorkspace();
    if (!isAdmin(root.user)) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Welcome · openheard" }] }),
  component: Welcome,
});

const ACCENTS = ["#6e8bff", "#3ecf8e", "#f2b53d", "#b08cff", "#e0705f", "#ffffff"];

function Welcome() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const ws = root.workspace;
  const [name, setName] = useState(ws.name === "openheard" ? "" : ws.name);
  const [tagline, setTagline] = useState(ws.tagline);
  const [accent, setAccent] = useState(ws.accent ?? ACCENTS[0]!);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = typeof window === "undefined" ? "" : window.location.origin;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveWorkspace({
        data: {
          name: name.trim(),
          tagline: tagline.trim(),
          theme: ws.theme === "light" ? "light" : "dark",
          poweredBy: ws.poweredBy,
          requireApproval: ws.requireApproval,
          accent: accent === ACCENTS[0] ? null : accent,
        },
      });
      await router.invalidate();
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      {done ? (
        <div className="flex w-full max-w-[400px] flex-col items-center gap-6 text-center">
          <Logo size={40} />
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold tracking-[-0.02em]">{name.trim()} is live.</h1>
            <p className="text-sm text-muted-foreground">Send this link to your users. They can post and vote straight away.</p>
          </div>
          <button type="button" onClick={copy} className="flex w-full items-center justify-between gap-3 rounded-lg border border-input bg-card px-3.5 py-2.5 text-left font-mono text-[13px] hover:border-ring/60">
            <span className="truncate">{link.replace(/^https?:\/\//, "")}</span>
            {copied ? <CheckIcon weight="bold" className="size-4 shrink-0 text-status-shipped" /> : <CopyIcon className="size-4 shrink-0 text-muted-foreground" />}
          </button>
          <div className="flex w-full flex-col gap-2">
            <Button full arrow size="lg" nativeButton={false} render={<Link to="/" />}>
              Post the first idea
            </Button>
            <Button full variant="ghost" size="lg" nativeButton={false} render={<Link to="/dashboard" />}>
              Open the dashboard
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex w-full max-w-[400px] flex-col items-center gap-6">
          <Logo size={40} />
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Name your board</h1>
            <p className="text-sm text-muted-foreground">Your users see this at the top of every page. You can change it later in settings.</p>
          </div>
          <div className="flex w-full flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Product or company</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={60} placeholder="Acme" className="h-10 rounded-lg border border-input bg-card px-3 text-[14px] outline-none placeholder:text-faint focus:border-ring/60" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">One line for the board header</span>
              <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={200} className="h-10 rounded-lg border border-input bg-card px-3 text-[14px] outline-none placeholder:text-faint focus:border-ring/60" />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Accent, used on voted pills and links</span>
              <div className="flex items-center gap-2.5 pt-1">
                {ACCENTS.map((c) => (
                  <button key={c} type="button" onClick={() => setAccent(c)} aria-label={c} className={cn("inline-flex size-[22px] items-center justify-center rounded-full", accent === c && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ background: c }}>
                    {accent === c ? <CheckIcon weight="bold" className="size-2.5 text-[#0d0d0f]" /> : null}
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" full arrow size="lg" disabled={busy || !name.trim()} className="mt-2">
              {busy ? "Saving" : "Create board"}
            </Button>
          </div>
          <Link to="/" className="text-xs text-faint hover:text-muted-foreground">
            Skip for now
          </Link>
        </form>
      )}
    </main>
  );
}
