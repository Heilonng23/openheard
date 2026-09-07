import { CheckCircleIcon, GlobeSimpleIcon, LinkSimpleIcon, MonitorIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@openheard/ui/components/button";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

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

const HEARD_OPTIONS = [
  "Twitter / X",
  "Product Hunt",
  "GitHub",
  "Blog post",
  "Search engine",
  "Friend or colleague",
  "Other",
];

function NewWorkspace() {
  const root = useLoaderData({ from: "__root__" });
  const [website, setWebsite] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [heardAboutUs, setHeardAboutUs] = useState("");
  const [busy, setBusy] = useState(false);
  const [slugBlurred, setSlugBlurred] = useState(false);

  const finalSlug = slugTouched ? slugify(slug) : slugify(name);
  const rootDomain = root.rootDomain;
  const domainSuffix = rootDomain ?? "openheard.com";

  const websiteValid = website.length > 0 && /^https?:\/\/.+\..+/.test(website);
  const nameValid = name.trim().length >= 2;
  const slugTooShort = finalSlug.length > 0 && finalSlug.length < 5;
  const slugValid = finalSlug.length >= 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (slugTooShort) return;
    setBusy(true);
    try {
      const { id } = await createWorkspace({ data: { name, slug: finalSlug, website: website || undefined, heardAboutUs: heardAboutUs || undefined } });
      window.location.href = workspaceUrl(id, rootDomain, "/welcome");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create workspace");
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const form = (e.target as HTMLElement).closest("form");
      form?.requestSubmit();
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <form onSubmit={submit} onKeyDown={handleKeyDown} className="flex w-full max-w-[480px] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Create your workspace</h1>
          <p className="text-sm text-muted-foreground">Set up a space to collect feedback, plan your roadmap, and share updates.</p>
        </div>

        <div className="flex flex-col gap-5">
          <Field label="Website" optional>
            <div className="flex items-center gap-2.5">
              <FieldBox icon={<GlobeSimpleIcon className="size-[15px]" />}>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
                />
              </FieldBox>
              {websiteValid ? <CheckCircleIcon weight="fill" className="size-5 shrink-0 text-emerald-500" /> : null}
            </div>
          </Field>

          <Field label="Workspace name">
            <div className="flex items-center gap-2.5">
              <FieldBox icon={<MonitorIcon className="size-[15px]" />}>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={60}
                  placeholder="Acme"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
                />
              </FieldBox>
              {nameValid ? <CheckCircleIcon weight="fill" className="size-5 shrink-0 text-emerald-500" /> : null}
            </div>
          </Field>

          <Field label="Subdomain">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <FieldBox icon={<LinkSimpleIcon className="size-[15px]" />}>
                  <input
                    value={slugTouched ? slug : finalSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(e.target.value);
                    }}
                    onBlur={() => setSlugBlurred(true)}
                    placeholder="acme"
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-faint"
                  />
                  <span className="font-mono text-sm text-faint">.{domainSuffix}</span>
                </FieldBox>
                {slugValid ? (
                  <CheckCircleIcon weight="fill" className="size-5 shrink-0 text-emerald-500" />
                ) : slugTooShort && slugBlurred ? (
                  <WarningCircleIcon weight="fill" className="size-5 shrink-0 text-red-500" />
                ) : null}
              </div>
              {slugTooShort && slugBlurred ? (
                <p className="text-[13px] text-red-400">Must be at least 5 characters long</p>
              ) : null}
            </div>
          </Field>

          <Field label="Where did you hear about us?" optional>
            <select
              value={heardAboutUs}
              onChange={(e) => setHeardAboutUs(e.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-ring/60 [&:not(:valid)]:text-faint"
            >
              <option value="">Select an option</option>
              {HEARD_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" disabled={busy || !nameValid || !slugValid}>
            {busy ? "Creating…" : "Create Workspace"}
            <kbd className="ml-2 inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-faint">⌘↵</kbd>
          </Button>
        </div>
      </form>
    </main>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {optional ? <span className="ml-2 text-xs font-normal text-faint">(optional)</span> : null}
      </span>
      {children}
    </div>
  );
}

function FieldBox({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex h-10 flex-1 items-center gap-2.5 rounded-lg border border-input bg-card px-3 text-faint transition-colors focus-within:border-ring/60 focus-within:ring-1 focus-within:ring-ring/40">
      {icon}
      {children}
    </label>
  );
}
