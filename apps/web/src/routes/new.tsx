import { Button } from "@openheard/ui/components/button";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import Logo from "@/components/logo";
import { createWorkspace } from "@/functions/admin";
import { getUser } from "@/functions/get-user";
import { workspaceUrl } from "@/lib/workspace-url";

export const Route = createFileRoute("/new")({
  beforeLoad: async () => {
    if (!(await getUser())) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "New workspace · openheard" }] }),
  component: NewWorkspace,
});

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

function NewWorkspace() {
  const root = useLoaderData({ from: "__root__" });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const finalSlug = touched ? slugify(slug) : slugify(name);
  const rootDomain = root.rootDomain;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await createWorkspace({ data: { name, slug: finalSlug } });
      window.location.href = workspaceUrl(id, rootDomain, "/welcome");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create workspace");
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <form onSubmit={submit} className="flex w-full max-w-[380px] flex-col items-center gap-6">
        <Logo size={40} />
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Create a workspace</h1>
          <p className="text-sm text-muted-foreground">One board, one team. You can make more later.</p>
        </div>
        <div className="flex w-full flex-col gap-2.5">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Company or product name" className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none placeholder:text-faint focus:border-ring/60" />
          <label className="flex h-10 items-center rounded-lg border border-input bg-card px-3 text-sm focus-within:border-ring/60">
            <input
              value={touched ? slug : finalSlug}
              onChange={(e) => {
                setTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="slug"
              className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-faint"
            />
            <span className="font-mono text-[13px] text-faint">.{rootDomain ?? "openheard.com"}</span>
          </label>
          <Button type="submit" full arrow size="lg" disabled={busy || !finalSlug} className="mt-1">
            {busy ? "Creating" : "Create workspace"}
          </Button>
        </div>
      </form>
    </main>
  );
}
