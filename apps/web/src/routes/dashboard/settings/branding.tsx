import { Button } from "@openheard/ui/components/button";
import { CheckIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { Row, SectionHead } from "@/components/admin/panel";
import Logo from "@/components/logo";
import { applyBrand, matchBrand } from "@/functions/brand";
import { saveWorkspace } from "@/functions/settings";
import { PageHead } from "@/routes/dashboard/settings";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/dashboard/settings/branding")({
  head: () => ({ meta: [{ title: "Branding · settings" }] }),
  component: Branding,
});

const DEFAULT = "#6e8bff";
const SWATCHES = [DEFAULT, "#3ecf8e", "#f2b53d", "#e0705f", "#b08cff", "#5fc8e0", "#ff8fab", "#ededf0"];

type Match = Awaited<ReturnType<typeof matchBrand>>;
type Pick = { logo: boolean; name: boolean; accent: boolean; theme: boolean };

function Branding() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const ws = root.workspace;
  const [accent, setAccent] = useState(ws.accent ?? DEFAULT);
  const [busy, setBusy] = useState(false);
  const dirty = accent !== (ws.accent ?? DEFAULT);

  async function save() {
    setBusy(true);
    try {
      await saveWorkspace({ data: { name: ws.name, tagline: ws.tagline, theme: ws.theme === "light" ? "light" : "dark", poweredBy: ws.poweredBy, requireApproval: ws.requireApproval, accent: accent === DEFAULT ? null : accent } });
      await router.invalidate();
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    try {
      await applyBrand({ data: { removeLogo: true } });
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the logo");
    }
  }

  return (
    <>
      <PageHead title="Branding" sub="How the public board looks to your users. The dashboard stays the same for everyone." />
      <MatchWebsite
        initialUrl={ws.website ?? ""}
        currentName={ws.name === "openheard" ? "" : ws.name}
        onApplied={async (applied) => {
          if (applied) setAccent(applied);
          await router.invalidate();
        }}
      />
      <SectionHead title="Appearance" />
      <Row label="Accent" help="Voted pills, the active nav dot, links and focus rings on the public board.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex flex-wrap gap-1.5">
            {SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => setAccent(c)} aria-label={c} className={cn("inline-flex size-[22px] items-center justify-center rounded-full", accent === c && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ background: c }}>
                {accent === c ? <CheckIcon weight="bold" className="size-2.5 text-[#0d0d0f]" /> : null}
              </button>
            ))}
          </span>
          <input value={accent} onChange={(e) => setAccent(e.target.value)} aria-label="Accent color" className="h-8 w-24 rounded-lg border border-input bg-card px-2.5 text-[12px] tabular-nums outline-none focus:border-ring/60" />
        </div>
      </Row>
      <Row label="Preview" help="A voted pill in your accent.">
        <span className="flex h-14 w-12 flex-col items-center justify-center gap-0.5 rounded-lg border text-[#0d0d0f]" style={{ background: accent, borderColor: accent }}>
          <span className="text-[13px] leading-none">▲</span>
          <span className="text-[13px] leading-none font-semibold tabular-nums">128</span>
        </span>
      </Row>
      <Row label="Logo" help={ws.logoUrl ? "Shown in the board header and the widget." : "Match your website above to bring in your logo."}>
        <div className="flex items-center gap-2.5">
          {ws.logoUrl ? <img src={ws.logoUrl} alt="" className="size-9 rounded-lg border object-cover" /> : <Logo size={36} />}
          {ws.logoUrl ? (
            <Button variant="secondary" size="sm" onClick={removeLogo}>
              Remove
            </Button>
          ) : null}
        </div>
      </Row>
      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <span className="text-xs text-faint">{dirty ? "Unsaved changes" : "Saved"}</span>
        <Button arrow size="sm" disabled={!dirty || busy} onClick={save}>
          Save
        </Button>
      </div>
    </>
  );
}

function MatchWebsite({ initialUrl, currentName, onApplied }: { initialUrl: string; currentName: string; onApplied: (accent: string | null) => Promise<void> }) {
  const [url, setUrl] = useState(initialUrl);
  const [state, setState] = useState<"idle" | "reading" | "applying">("idle");
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick>({ logo: true, name: true, accent: true, theme: true });

  async function read(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || state !== "idle") return;
    setState("reading");
    setError(null);
    try {
      const m = await matchBrand({ data: { url } });
      setMatch(m);
      setChosen(m.accent);
      // A page's name is often a tagline, so it only replaces a name the user never set.
      setPick({ logo: !!m.logo, name: !!m.name && !currentName, accent: !!m.accent, theme: !!m.theme });
    } catch (err) {
      setMatch(null);
      setError(err instanceof Error ? err.message : "Could not read that website");
    } finally {
      setState("idle");
    }
  }

  async function apply() {
    if (!match) return;
    setState("applying");
    try {
      const accent = pick.accent && chosen ? chosen : undefined;
      const res = await applyBrand({ data: { name: pick.name && match.name ? match.name : undefined, accent, theme: pick.theme && match.theme ? match.theme : undefined, logoSrc: pick.logo && match.logo ? match.logo.src : undefined } });
      await onApplied(accent ?? null);
      setMatch(null);
      if (res.logoSkipped) toast.message("Applied. The logo could not be stored, so it was left out.");
      else toast.success("Applied");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply");
    } finally {
      setState("idle");
    }
  }

  const toggle = (k: keyof Pick) => setPick((p) => ({ ...p, [k]: !p[k] }));
  const host = match ? new URL(match.url).hostname.replace(/^www\./, "") : "";
  const anything = match && (match.logo || match.name || match.accent || match.theme || match.font);
  const anyPicked = match && ((pick.logo && match.logo) || (pick.name && match.name) || (pick.accent && chosen) || (pick.theme && match.theme));

  return (
    <div className="pb-6">
      <SectionHead title="Match my website" />
      <Row label="Website" help="We read your homepage for its colours, logo and name. Nothing changes until you apply.">
        <form onSubmit={read} className="flex flex-wrap items-center gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yoursite.com" aria-label="Website" inputMode="url" className="h-8 w-56 rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-ring/60" />
          <Button type="submit" variant="secondary" size="sm" disabled={!url.trim() || state !== "idle"}>
            {state === "reading" ? "Reading…" : "Match my website"}
          </Button>
        </form>
      </Row>
      {error ? <p className="pb-3 text-right text-xs text-red-400">{error}</p> : null}
      {state === "reading" ? (
        <div className="flex flex-col gap-2 border-t py-3.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-card motion-reduce:animate-none" />
          ))}
        </div>
      ) : null}
      {match && !anything ? <p className="border-t py-3.5 text-xs text-faint">Nothing reliable found on {host}. Your board keeps its current look.</p> : null}
      {match && anything ? (
        <div className="border-t">
          <p className="py-3 text-xs text-faint">Found on {host}. Untick anything you want to keep as it is.</p>
          {match.logo ? (
            <Found label="Logo" checked={pick.logo} onToggle={() => toggle("logo")}>
              <img src={match.logo.preview} alt="" className="size-8 rounded-lg border object-cover" />
            </Found>
          ) : null}
          {match.name ? (
            <Found label="Name" checked={pick.name} onToggle={() => toggle("name")} note={currentName && currentName !== match.name ? `Tick to rename ${currentName}.` : undefined}>
              <span className="text-[13px]">{match.name}</span>
            </Found>
          ) : null}
          <Found label="Accent" checked={pick.accent && !!chosen} disabled={!match.colors.length} onToggle={() => (!chosen && setChosen(match.colors[0] ?? null), toggle("accent"))} note={match.accent && chosen === match.accent && match.accentOriginal !== match.accent ? `Lightened from ${match.accentOriginal} so it reads on the dark board.` : !match.colors.length ? "No brand colour found. Your current accent stays." : undefined}>
            <span className="flex flex-wrap gap-1.5">
              {[...new Set([match.accent, ...match.colors].filter((c): c is string => !!c))].slice(0, 5).map((c) => (
                <button key={c} type="button" onClick={() => (setChosen(c), setPick((p) => ({ ...p, accent: true })))} aria-label={`Use ${c}`} title={c} className={cn("inline-flex size-[22px] items-center justify-center rounded-full", chosen === c && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ background: c }}>
                  {chosen === c ? <CheckIcon weight="bold" className="size-2.5 text-[#0d0d0f]" /> : null}
                </button>
              ))}
            </span>
          </Found>
          {match.theme ? (
            <Found label="Background" checked={pick.theme} onToggle={() => toggle("theme")}>
              <span className="flex items-center gap-2 text-[13px]">
                <span className={cn("size-3.5 rounded-full border", match.theme === "dark" ? "bg-[#0d0d0f]" : "bg-[#f7f5f0]")} />
                {match.theme === "dark" ? "Dark" : "Light"}
              </span>
            </Found>
          ) : null}
          {match.font ? (
            <Found label="Font" note="For reference. Boards are set in Geist.">
              <span className="text-[13px]">{match.font}</span>
            </Found>
          ) : null}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button variant="ghost" size="sm" onClick={() => setMatch(null)}>
              Dismiss
            </Button>
            <Button arrow size="sm" disabled={!anyPicked || state !== "idle"} onClick={apply}>
              {state === "applying" ? "Applying…" : "Apply selected"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// One detected item: a tick box when it can be applied, the value on the right.
function Found({ label, checked, disabled, onToggle, note, children }: { label: string; checked?: boolean; disabled?: boolean; onToggle?: () => void; note?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t py-2.5">
      <label className={cn("flex min-w-[180px] flex-[1_1_200px] items-center gap-2.5", onToggle && !disabled && "cursor-pointer")}>
        {onToggle ? <input type="checkbox" checked={!!checked} disabled={disabled} onChange={onToggle} className="size-3.5 accent-white" /> : <span className="size-3.5" />}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-semibold">{label}</span>
          {note ? <span className="text-xs text-faint">{note}</span> : null}
        </span>
      </label>
      <div className="max-w-full min-w-0 pl-6">{children}</div>
    </div>
  );
}
