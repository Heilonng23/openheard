import { Button } from "@openheard/ui/components/button";
import { Textarea } from "@openheard/ui/components/textarea";
import { cn } from "@openheard/ui/lib/utils";
import {
  ChatCircleDotsIcon,
  CheckIcon,
  CircleHalfIcon,
  CopyIcon,
  LightbulbIcon,
  MegaphoneIcon,
  MoonIcon,
  QuestionIcon,
  SparkleIcon,
  SunIcon,
  type Icon,
} from "@phosphor-icons/react";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Row, SectionHead, Toggle } from "@/components/admin/panel";
import { saveWidgetOrigins, saveWidgetSettings } from "@/functions/widget";
import { isDemo } from "@/lib/demo";
import { parseEmbedOrigins } from "@/lib/widget-origins";
import {
  DEFAULT_ACCENT,
  DEFAULT_WIDGET_SETTINGS,
  WIDGET_ICONS,
  WIDGET_LABEL_MAX,
  WIDGET_TABS,
  readWidgetSettings,
  type WidgetIcon,
  type WidgetLauncher,
  type WidgetSettings,
  type WidgetTabName,
} from "@/lib/widget-settings";
import { workspaceUrl } from "@/lib/workspace-url";
import { PageHead } from "@/routes/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings/widget")({
  head: () => ({ meta: [{ title: "Widget · settings" }] }),
  component: WidgetSettings,
});

type Page = "install" | "appearance" | "content";
const PAGES: [Page, string][] = [
  ["install", "Install"],
  ["appearance", "Appearance"],
  ["content", "Content"],
];

function WidgetSettings() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const ws = root.workspace;
  const [page, setPage] = useState<Page>("install");
  const saved = useMemo(() => readWidgetSettings(ws.widgetSettings), [ws.widgetSettings]);
  const [draft, setDraft] = useState<WidgetSettings>(saved);
  const [saving, setSaving] = useState(false);
  const brand = ws.accent ?? DEFAULT_ACCENT;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  // Self-hosted installs serve the board at the dashboard's own origin.
  const [src, setSrc] = useState(() => workspaceUrl(ws.id, root.rootDomain, "/widget.js"));
  useEffect(() => {
    if (src.startsWith("/")) setSrc(window.location.origin + src);
  }, [src]);

  const set = <K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      const next = await saveWidgetSettings({ data: draft });
      setDraft(next);
      await router.invalidate();
      toast.success("Saved. Sites with the snippet pick it up within a minute.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead title="Widget" sub="Put feedback, your roadmap and the changelog inside your own app with one script tag." />
      <nav className="-mt-2 mb-6 flex gap-1 border-b" aria-label="Widget settings">
        {PAGES.map(([p, label]) => (
          <button
            key={p}
            type="button"
            onClick={() => setPage(p)}
            aria-current={page === p ? "page" : undefined}
            className={cn("relative -mb-px h-9 border-b px-3 text-[13px] transition-colors", page === p ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </nav>

      {page === "install" ? (
        <Install src={src} locked={isDemo(ws)} origins={ws.widgetOrigins} />
      ) : (
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_520px]">
          <div className="min-w-0">
            {page === "appearance" ? <Appearance draft={draft} set={set} brand={brand} /> : <Content draft={draft} set={set} ws={ws} />}
            <div className="flex items-center justify-end gap-3 border-t pt-4">
              <span className="text-xs text-faint">{dirty ? "Unsaved changes" : "Saved"}</span>
              {dirty ? (
                <Button size="sm" variant="secondary" onClick={() => setDraft(saved)} disabled={saving}>
                  Discard
                </Button>
              ) : null}
              <Button arrow size="sm" disabled={!dirty || saving} onClick={save}>
                Save
              </Button>
            </div>
          </div>
          <Preview src={src} settings={draft} brand={brand} />
        </div>
      )}
    </>
  );
}

function Install({ src, locked, origins }: { src: string; locked: boolean; origins: string | null }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${src}" async></script>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy. Select the snippet and copy it by hand.");
    }
  }

  return (
    <>
      <SectionHead title="Snippet" />
      <div className="mb-8 flex flex-col gap-2.5 border-t pt-4">
        <p className="text-[13px] text-muted-foreground">
          Paste this before the closing body tag on every page that should show the launcher. It loads after your page and never blocks it. Appearance changes reach it on their own; you never edit the snippet again.
        </p>
        <div className="flex items-start gap-2 rounded-lg border bg-card p-1.5 pl-3.5">
          <code className="min-w-0 flex-1 py-1.5 font-mono text-[12px]/5 break-all text-foreground">{snippet}</code>
          <Button size="sm" variant="secondary" onClick={copy} aria-label="Copy snippet">
            {copied ? <CheckIcon weight="bold" className="size-3 text-status-shipped" /> : <CopyIcon className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <SectionHead title="Open it from your own button" />
      <div className="mb-8 flex flex-col gap-2.5 border-t pt-4 text-[13px] text-muted-foreground">
        <p>
          Any element with a <code className="font-mono text-[12px] text-foreground">data-openheard-open</code> attribute opens the widget, or call{" "}
          <code className="font-mono text-[12px] text-foreground">window.openheard("open")</code>. Pass a tab to land on it. Set the launcher to Hidden under Appearance if your button is the only way in.
        </p>
        <code className="rounded-md bg-card px-2.5 py-1.5 font-mono text-[12px] text-foreground">{`<button data-openheard-open="changelog">What's new</button>`}</code>
      </div>

      <AllowedSites current={origins} locked={locked} />
    </>
  );
}

type SetFn = <K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) => void;

const SWATCHES = [DEFAULT_ACCENT, "#e5484d", "#f2a93b", "#3ecf8e", "#ededf0"];
const ICONS: Record<WidgetIcon, Icon> = { chat: ChatCircleDotsIcon, lightbulb: LightbulbIcon, megaphone: MegaphoneIcon, question: QuestionIcon, sparkle: SparkleIcon };
const ICON_NAMES: Record<WidgetIcon, string> = { chat: "Chat", lightbulb: "Light bulb", megaphone: "Megaphone", question: "Question", sparkle: "Sparkle" };

function Appearance({ draft, set, brand }: { draft: WidgetSettings; set: SetFn; brand: string }) {
  const accent = draft.accent ?? brand;
  const [hex, setHex] = useState(accent);
  useEffect(() => setHex(accent), [accent]);
  const LauncherIcon = ICONS[draft.icon];

  return (
    <>
      <Row label="Theme" help="Auto follows the visitor's system setting.">
        <Segmented
          value={draft.theme}
          onChange={(v) => set("theme", v)}
          options={[
            ["dark", "Dark", MoonIcon],
            ["light", "Light", SunIcon],
            ["auto", "Auto", CircleHalfIcon],
          ]}
        />
      </Row>
      <Row label="Accent" help="Launcher, voted pills and links. Defaults to your brand colour.">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("accent", c === brand ? null : c)}
                aria-label={c}
                aria-pressed={accent === c}
                className={cn("size-[22px] rounded-full", accent === c && "ring-2 ring-foreground ring-offset-2 ring-offset-background")}
                style={{ background: c }}
              />
            ))}
          </span>
          <input
            value={hex}
            onChange={(e) => {
              setHex(e.target.value);
              const v = e.target.value.trim().toLowerCase();
              if (/^#[0-9a-f]{6}$/.test(v)) set("accent", v === brand ? null : v);
            }}
            aria-label="Accent colour"
            aria-invalid={!/^#[0-9a-f]{6}$/i.test(hex.trim()) || undefined}
            className="h-8 w-24 rounded-lg border border-input bg-card px-2.5 text-[12px] tabular-nums outline-none focus:border-ring/60 aria-invalid:border-destructive"
          />
        </div>
      </Row>
      <Row label="Launcher" help="The button that opens the widget.">
        <div className="flex gap-2" role="radiogroup" aria-label="Launcher">
          {(
            [
              ["icon", "Icon"],
              ["label", "Icon + label"],
              ["hidden", "Hidden"],
            ] as [WidgetLauncher, string][]
          ).map(([v, name]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={draft.launcher === v}
              onClick={() => set("launcher", v)}
              className={cn("flex w-[112px] flex-col gap-2 rounded-xl border bg-card p-1.5 pb-2 text-xs transition-colors", draft.launcher === v ? "border-link text-foreground" : "text-muted-foreground hover:border-foreground/20")}
            >
              <span className="flex h-12 items-center justify-center rounded-lg bg-background">
                {v === "icon" ? (
                  <span className="grid size-7 place-items-center rounded-full" style={{ background: accent, color: inkOn(accent) }}>
                    <LauncherIcon weight="bold" className="size-3.5" />
                  </span>
                ) : v === "label" ? (
                  <span className="flex h-6 max-w-[96px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold" style={{ background: accent, color: inkOn(accent) }}>
                    <LauncherIcon weight="bold" className="size-3 shrink-0" />
                    <span className="truncate">{draft.label}</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-faint">Your own button</span>
                )}
              </span>
              {name}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Label and icon" help="Shown on the launcher.">
        <div className="flex items-center gap-2">
          <input
            value={draft.label}
            maxLength={WIDGET_LABEL_MAX}
            onChange={(e) => set("label", e.target.value)}
            onBlur={() => !draft.label.trim() && set("label", DEFAULT_WIDGET_SETTINGS.label)}
            aria-label="Launcher label"
            className="h-8 w-36 rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none focus:border-ring/60"
          />
          <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border bg-card p-0.5" role="radiogroup" aria-label="Launcher icon">
            {WIDGET_ICONS.map((i) => {
              const I = ICONS[i];
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={draft.icon === i}
                  aria-label={ICON_NAMES[i]}
                  title={ICON_NAMES[i]}
                  onClick={() => set("icon", i)}
                  className={cn("grid h-full w-7 place-items-center rounded-md transition-colors", draft.icon === i ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  <I weight="bold" className="size-3.5" />
                </button>
              );
            })}
          </div>
        </div>
      </Row>
      <Row label="Position" help="Which corner it sits in.">
        <Segmented
          value={draft.position}
          onChange={(v) => set("position", v)}
          options={[
            ["bottom-right", "Bottom right"],
            ["bottom-left", "Bottom left"],
          ]}
        />
      </Row>
      <Row label="Corner radius" help="Match your app's buttons and cards.">
        <Segmented
          value={draft.radius}
          onChange={(v) => set("radius", v)}
          options={[
            ["sharp", "Sharp"],
            ["soft", "Soft"],
            ["round", "Round"],
          ]}
        />
      </Row>
    </>
  );
}

const TAB_NAMES: Record<WidgetTabName, string> = { feedback: "Feedback", roadmap: "Roadmap", changelog: "Changelog" };

function Content({ draft, set, ws }: { draft: WidgetSettings; set: SetFn; ws: { showRoadmap: boolean; showChangelog: boolean } }) {
  const hiddenEverywhere = (t: WidgetTabName) => (t === "roadmap" && !ws.showRoadmap) || (t === "changelog" && !ws.showChangelog);
  return (
    <>
      <SectionHead title="Tabs" />
      <p className="pb-3 text-[13px] text-muted-foreground">Turn off what you do not use. The first one on opens by default.</p>
      {WIDGET_TABS.map((t) => {
        const on = draft.tabs.includes(t);
        const last = on && draft.tabs.length === 1;
        return (
          <Row key={t} label={TAB_NAMES[t]} help={hiddenEverywhere(t) ? "Hidden on your public board too, so the widget skips it. Turn it on under Access." : last ? "Keep at least one tab on." : undefined}>
            <Toggle
              on={on}
              label={TAB_NAMES[t]}
              onChange={(next) => {
                if (!next && last) return;
                set("tabs", next ? WIDGET_TABS.filter((x) => x === t || draft.tabs.includes(x)) : draft.tabs.filter((x) => x !== t));
              }}
            />
          </Row>
        );
      })}
    </>
  );
}

// Which sites may embed the panel. Empty means any site, which is what makes
// the snippet work the moment it is pasted.
function AllowedSites({ current, locked }: { current: string | null; locked: boolean }) {
  const router = useRouter();
  const saved = (current ?? "").split(" ").filter(Boolean).join("\n");
  const [value, setValue] = useState(saved);
  const [saving, setSaving] = useState(false);
  const { invalid } = parseEmbedOrigins(value);

  async function save() {
    setSaving(true);
    try {
      const { origins } = await saveWidgetOrigins({ data: { origins: value } });
      setValue(origins.join("\n"));
      await router.invalidate();
      toast.success(origins.length ? "Only those sites can embed the widget now" : "Any site can embed the widget");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8">
      <SectionHead title="Allowed sites" />
      <div className="flex flex-col gap-2.5 border-t pt-4">
        <p className="text-[13px] text-muted-foreground">
          The sites that may show the widget, one origin per line, like <code className="font-mono text-[12px] text-foreground">https://app.example.com</code> or{" "}
          <code className="font-mono text-[12px] text-foreground">https://*.example.com</code>. Leave it empty to allow any site. Other sites get a blank frame, so nobody can dress up your board inside their page.
        </p>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={locked}
          placeholder="Any site"
          spellCheck={false}
          aria-invalid={invalid.length > 0 || undefined}
          className="font-mono text-[12px]"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-faint">{locked ? "Fixed in the demo." : invalid.length ? `Not an origin: ${invalid[0]}` : ""}</span>
          <Button size="sm" variant="secondary" onClick={save} disabled={locked || saving || invalid.length > 0 || value === saved}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string, Icon?][] }) {
  return (
    <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border bg-card p-0.5" role="radiogroup">
      {options.map(([v, label, I]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn("inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors", value === v ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {I ? <I className="size-3.5" /> : null}
          {label}
        </button>
      ))}
    </div>
  );
}

// Dark ink on light accents, white on dark ones; the loader does the same.
function inkOn(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16);
  return (n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150 ? "#0d0d0f" : "#ffffff";
}

// A stand-in host page with the real script on it, opened on load. Unsaved
// changes reach it through window.openheard("config"), so it never reloads.
function Preview({ src, settings, brand }: { src: string; settings: WidgetSettings; brand: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const config = useMemo(() => ({ ...settings, accent: settings.accent ?? brand }), [settings, brand]);
  const first = useRef(config);
  useEffect(() => {
    const w = frame.current?.contentWindow as (Window & { openheard?: (cmd: string, arg: unknown) => void }) | null | undefined;
    w?.openheard?.("config", config);
  }, [config]);

  const summary = [settings.theme, settings.launcher === "label" ? "icon + label" : settings.launcher === "icon" ? "icon" : "no launcher"].join(" · ");
  const head = (
    <div className="flex items-center justify-between pb-2 text-xs">
      <span className="font-semibold text-muted-foreground">Preview</span>
      <span className="text-faint">{summary}</span>
    </div>
  );
  if (src.startsWith("/")) return <div>{head}<div className="h-[680px] rounded-xl border bg-card" /></div>;
  const line = (w: number) => `<div style="height:10px;width:${w}%;border-radius:5px;background:#e6e4de;margin:0 0 12px"></div>`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:14px system-ui,sans-serif;background:#f7f5f0}header{height:48px;border-bottom:1px solid #e6e4de;display:flex;align-items:center;padding:0 20px;gap:10px}main{padding:28px 20px}</style></head><body><header><div style="width:18px;height:18px;border-radius:5px;background:#d8d5cc"></div>${line(12).replace("margin:0 0 12px", "margin:0")}</header><main>${line(60)}${line(90)}${line(80)}</main><script>window.openheard=function(){(window.openheard.q=window.openheard.q||[]).push(arguments)};window.openheard("config",${JSON.stringify(first.current).replace(/</g, "\\u003c")})</script><script src="${src}" data-open-on-load async></script></body></html>`;
  return (
    <div className="xl:sticky xl:top-0">
      {head}
      <div className="overflow-hidden rounded-xl border">
        <iframe ref={frame} title="Widget preview" srcDoc={doc} className="block h-[680px] w-full bg-[#f7f5f0]" />
      </div>
      <p className="pt-2 text-xs text-faint">Live, against this workspace. Votes and posts are real.</p>
    </div>
  );
}
