import { ArrowLeftIcon, CheckCircleIcon, GlobeSimpleIcon, LockSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@openheard/ui/components/button";
import { cn } from "@openheard/ui/lib/utils";
import { AuthForm } from "@/components/auth-form";
import Logo from "@/components/logo";
import { checkSlug, createWorkspace } from "@/functions/admin";
import { getUser } from "@/functions/get-user";
import { getWorkspaceMemberCount } from "@/functions/invites";
import { consumePendingAction } from "@/lib/pending-action";
import { workspaceUrl } from "@/lib/workspace-url";

const STORAGE_KEY = "openheard:onboarding";
const STEPS = 3;

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

type OnboardingData = {
  name: string;
  slug: string;
  whoCanPost: "anyone" | "members";
  // Optional. The new board starts in this site's colours and logo.
  website?: string;
};

// "acme.com" -> "https://acme.com"; anything that is not a plausible address is dropped.
function normalizeWebsite(input: string): string {
  const s = input.trim();
  if (!s) return "";
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  return /^https?:\/\/[^\s/.]+\.[^\s]+$/i.test(url) ? url : "";
}

function saveOnboarding(data: Partial<OnboardingData>) {
  const prev = loadOnboarding();
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...data }));
}

function loadOnboarding(): Partial<OnboardingData> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function clearOnboarding() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export const Route = createFileRoute("/start")({
  beforeLoad: async () => {
    const user = await getUser();
    if (user) {
      // Already signed in — check for pending workspace creation from a Google redirect.
      if (typeof sessionStorage !== "undefined") {
        const pending = consumePendingAction();
        if (pending?.type === "create-workspace") {
          saveOnboarding({ name: pending.name, slug: pending.slug, whoCanPost: pending.whoCanPost });
        }
      }
    }
    return { user };
  },
  loader: () => getWorkspaceMemberCount(),
  head: () => ({ meta: [{ title: "Get started · openheard" }] }),
  component: StartPage,
});

async function finishOnboarding(data: OnboardingData, rootDomain: string | null) {
  const { id } = await createWorkspace({
    data: {
      name: data.name,
      slug: data.slug,
      whoCanPost: data.whoCanPost,
      website: data.website || undefined,
    },
  });
  clearOnboarding();
  window.location.href = workspaceUrl(id, rootDomain, "/dashboard");
  await new Promise(() => {});
}

function StartPage() {
  const router = useRouter();
  const { user } = Route.useRouteContext();
  const memberCount = Route.useLoaderData();
  const rootData = useLoaderData({ from: "__root__" });
  const rootDomain = rootData.rootDomain;
  const hasGoogle = rootData.googleSignIn;
  const wsName = rootData.workspace?.name ?? "openheard";

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [whoCanPost, setWhoCanPost] = useState<"anyone" | "members">("anyone");
  const [busy, setBusy] = useState(false);
  const [slugStatus, setSlugStatus] = useState<{ available: boolean; suggestion: string | null } | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const creating = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const slug = slugTouched ? slugify(slugInput) : slugify(name);

  const debouncedCheck = useCallback((s: string) => {
    clearTimeout(debounceRef.current);
    setSlugStatus(null);
    if (s.length < 5) { setSlugChecking(false); return; }
    setSlugChecking(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await checkSlug({ data: { slug: s } });
        setSlugStatus(result);
      } catch {
        setSlugStatus(null);
      } finally {
        setSlugChecking(false);
      }
    }, 300);
  }, []);

  // If user is already signed in and has onboarding data, create the workspace.
  useEffect(() => {
    if (!user || creating.current) return;
    const stored = loadOnboarding();
    if (stored.name && stored.slug && stored.whoCanPost) {
      creating.current = true;
      setBusy(true);
      finishOnboarding(stored as OnboardingData, rootDomain).catch((err) => {
        creating.current = false;
        setBusy(false);
        toast.error(err instanceof Error ? err.message : "Could not create workspace");
        clearOnboarding();
      });
    }
  }, [user, rootDomain]);

  // Skip to step 1 if signed in (screen 3 unnecessary).
  // If signed in and no onboarding data, let them fill in steps 1 & 2.
  const maxStep = user ? 2 : STEPS;

  const websiteUrl = normalizeWebsite(website);
  const slugReady = slug.length >= 5 && slugStatus?.available === true && !slugChecking;

  function next() {
    if (step === 1) {
      if (!slugReady) return;
      saveOnboarding({ name: name.trim(), slug, website: websiteUrl });
      setStep(2);
    } else if (step === 2) {
      saveOnboarding({ whoCanPost });
      if (user) {
        // Already signed in — create workspace now.
        setBusy(true);
        finishOnboarding({ name: name.trim(), slug, whoCanPost, website: websiteUrl }, rootDomain).catch((err) => {
          setBusy(false);
          toast.error(err instanceof Error ? err.message : "Could not create workspace");
        });
      } else {
        setStep(3);
      }
    }
  }

  function back() {
    if (step > 1) setStep(step - 1);
  }

  async function afterAuth() {
    await router.invalidate();
    setBusy(true);
    const stored = loadOnboarding();
    const data: OnboardingData = {
      name: stored.name || name.trim(),
      slug: stored.slug || slug,
      whoCanPost: stored.whoCanPost || whoCanPost,
      website: stored.website ?? websiteUrl,
    };
    saveOnboarding(data);
    try {
      await finishOnboarding(data, rootDomain);
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : "Could not create workspace");
    }
  }

  function onGoogleClick() {
    // Save onboarding data before the redirect.
    saveOnboarding({ name: name.trim(), slug, whoCanPost, website: websiteUrl });
  }

  if (busy) {
    return (
      <main className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="flex flex-col items-center gap-4">
          <Logo size={32} />
          <p className="text-sm text-muted-foreground">Creating your workspace…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-6">
        <Logo size={32} />

        {step === 1 && (
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
                What is your company or product called?
              </h1>
            </div>
            <div className="flex w-full flex-col gap-2.5">
              <label className="flex h-10 items-center gap-2.5 rounded-lg border border-input bg-card px-3 text-faint transition-colors focus-within:border-ring/60 focus-within:ring-1 focus-within:ring-ring/40">
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugTouched) debouncedCheck(slugify(e.target.value));
                  }}
                  autoFocus
                  placeholder="Acme"
                  maxLength={60}
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
                  onKeyDown={(e) => { if (e.key === "Enter") next(); }}
                />
              </label>
              <div className="flex items-center gap-2">
                <label className="flex h-8 flex-1 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-faint transition-colors focus-within:border-ring/60 focus-within:ring-1 focus-within:ring-ring/40">
                  <input
                    value={slugTouched ? slugInput : slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlugInput(e.target.value);
                      debouncedCheck(slugify(e.target.value));
                    }}
                    placeholder="acme"
                    maxLength={32}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint"
                    onKeyDown={(e) => { if (e.key === "Enter") next(); }}
                  />
                  <span className="text-[13px] text-faint">.{rootDomain ?? "openheard.com"}</span>
                </label>
                {slugChecking ? (
                  <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-faint border-t-transparent" />
                ) : slugStatus?.available ? (
                  <CheckCircleIcon weight="fill" className="size-5 shrink-0 text-emerald-500" />
                ) : slugStatus && !slugStatus.available ? (
                  <WarningCircleIcon weight="fill" className="size-5 shrink-0 text-red-500" />
                ) : null}
              </div>
              {slug.length > 0 && slug.length < 5 && (
                <p className="text-[13px] text-red-400">Slug must be at least 5 characters</p>
              )}
              {slugStatus?.available === true && (
                <p className="text-[13px] text-emerald-500">Available</p>
              )}
              {slugStatus && !slugStatus.available && slug.length >= 5 && (
                <p className="text-[13px] text-red-400">
                  That slug is taken
                  {slugStatus.suggestion && (
                    <>
                      {" — try "}
                      <button
                        type="button"
                        className="underline hover:text-foreground"
                        onClick={() => {
                          setSlugTouched(true);
                          setSlugInput(slugStatus.suggestion!);
                          debouncedCheck(slugStatus.suggestion!);
                        }}
                      >
                        {slugStatus.suggestion}
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
            <label className="flex w-full flex-col gap-1.5">
              <span className="text-[13px] text-muted-foreground">
                Website <span className="text-faint">(optional, we match your colours and logo)</span>
              </span>
              <span className="flex h-10 items-center gap-2.5 rounded-lg border border-input bg-card px-3 text-faint transition-colors focus-within:border-ring/60 focus-within:ring-1 focus-within:ring-ring/40">
                <GlobeSimpleIcon className="size-[15px]" />
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  inputMode="url"
                  placeholder="acme.com"
                  maxLength={200}
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
                  onKeyDown={(e) => { if (e.key === "Enter") next(); }}
                />
              </span>
            </label>
            <Button full arrow size="lg" disabled={!slugReady} onClick={next}>
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
                Who can see your board?
              </h1>
            </div>
            <div className="flex w-full flex-col gap-3">
              <AccessCard
                icon={<GlobeSimpleIcon className="size-5" />}
                title="Public"
                description="Anyone can view, vote and post"
                selected={whoCanPost === "anyone"}
                onClick={() => setWhoCanPost("anyone")}
              />
              <AccessCard
                icon={<LockSimpleIcon className="size-5" />}
                title="Private"
                description="Only people you invite"
                selected={whoCanPost === "members"}
                onClick={() => setWhoCanPost("members")}
              />
            </div>
            <Button full arrow size="lg" onClick={next}>
              {user ? "Create workspace" : "Continue"}
            </Button>
          </div>
        )}

        {step === 3 && !user && (
          <div className="flex w-full flex-col items-center gap-6">
            <p className="text-sm text-muted-foreground">All done, now sign up to continue</p>
            <AuthForm
              wsName={wsName}
              hasGoogle={hasGoogle}
              callbackURL="/start"
              onSuccess={afterAuth}
              onGoogleClick={onGoogleClick}
              showFirstAccountHint={memberCount === 0}
            />
          </div>
        )}

        {/* Step indicator and back */}
        <div className="flex items-center gap-4">
          {step > 1 && (
            <button type="button" onClick={back} className="flex items-center gap-1 text-xs text-faint hover:text-foreground">
              <ArrowLeftIcon className="size-3" /> Back
            </button>
          )}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: maxStep }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  i + 1 === step ? "bg-foreground" : "bg-border",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function AccessCard({
  icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-4 rounded-lg border px-4 py-3.5 text-left transition-colors",
        selected
          ? "border-ring/60 bg-accent ring-1 ring-ring/40"
          : "border-input bg-card hover:bg-accent/60",
      )}
    >
      <span className={cn("text-faint", selected && "text-foreground")}>{icon}</span>
      <div>
        <span className={cn("text-sm font-semibold", selected ? "text-foreground" : "text-muted-foreground")}>{title}</span>
        <p className="text-[13px] text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
