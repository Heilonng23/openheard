import { Button } from "@openheard/ui/components/button";
import { cn } from "@openheard/ui/lib/utils";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Row, SectionHead } from "@/components/admin/panel";
import { workspaceUrl } from "@/lib/workspace-url";
import { PageHead } from "@/routes/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings/widget")({
  head: () => ({ meta: [{ title: "Widget · settings" }] }),
  component: WidgetSettings,
});

type Position = "bottom-right" | "bottom-left";

function WidgetSettings() {
  const root = useLoaderData({ from: "__root__" });
  const ws = root.workspace;
  const [position, setPosition] = useState<Position>("bottom-right");
  const [launcher, setLauncher] = useState(true);
  const [copied, setCopied] = useState(false);
  // Self-hosted installs serve the board at the dashboard's own origin.
  const [src, setSrc] = useState(() => workspaceUrl(ws.id, root.rootDomain, "/widget.js"));
  useEffect(() => {
    if (src.startsWith("/")) setSrc(window.location.origin + src);
  }, [src]);

  const attrs = [position === "bottom-left" ? ` data-position="bottom-left"` : "", launcher ? "" : ` data-launcher="false"`].join("");
  const snippet = `<script src="${src}"${attrs} async></script>`;

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
      <PageHead title="Widget" sub="Put feedback, your roadmap and the changelog inside your own app with one script tag." />

      <SectionHead title="Install" />
      <div className="mb-8 flex flex-col gap-2.5 border-t pt-4">
        <p className="text-[13px] text-muted-foreground">Paste this before the closing body tag on every page that should show the launcher. It loads after your page and never blocks it.</p>
        <div className="flex items-start gap-2 rounded-lg border bg-card p-1.5 pl-3.5">
          <code className="min-w-0 flex-1 py-1.5 font-mono text-[12px]/5 break-all text-foreground">{snippet}</code>
          <Button size="sm" variant="secondary" onClick={copy} aria-label="Copy snippet">
            {copied ? <CheckIcon weight="bold" className="size-3 text-status-shipped" /> : <CopyIcon className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <SectionHead title="Options" />
      <Row label="Position" help="Which corner the launcher and panel sit in.">
        <Segmented
          value={position}
          onChange={setPosition}
          options={[
            ["bottom-right", "Bottom right"],
            ["bottom-left", "Bottom left"],
          ]}
        />
      </Row>
      <Row label="Launcher button" help="Hide it to open the widget from your own button instead.">
        <Segmented
          value={launcher ? "on" : "off"}
          onChange={(v) => setLauncher(v === "on")}
          options={[
            ["on", "Show"],
            ["off", "Hide"],
          ]}
        />
      </Row>
      {!launcher ? (
        <div className="flex flex-col gap-1.5 border-t py-3.5 text-[13px] text-muted-foreground">
          Any element with a <code className="font-mono text-[12px] text-foreground">data-openheard-open</code> attribute opens it, or call{" "}
          <code className="font-mono text-[12px] text-foreground">window.openheard("open")</code>. Pass a tab to land on it:
          <code className="rounded-md bg-card px-2.5 py-1.5 font-mono text-[12px] text-foreground">{`<button data-openheard-open="changelog">What's new</button>`}</code>
        </div>
      ) : null}
      <Row label="Colours" help="The launcher and voted pills use your accent. Change it under Branding.">
        <span className="inline-flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
          <span className="size-4 rounded-full" style={{ background: ws.accent ?? "#6e8bff" }} />
          {ws.accent ?? "#6e8bff"}
        </span>
      </Row>

      <div className="mt-8">
        <SectionHead title="Preview" right={<span className="text-xs text-faint">Live, against this workspace. Votes and posts are real.</span>} />
        <Preview key={snippet} src={src} position={position} launcher={launcher} />
      </div>
    </>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border bg-card p-0.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn("h-full rounded-md px-2.5 text-xs transition-colors", value === v ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// A stand-in host page with the real script on it, opened on load.
function Preview({ src, position, launcher }: { src: string; position: Position; launcher: boolean }) {
  if (src.startsWith("/")) return <div className="h-[560px] rounded-xl border bg-card" />;
  const line = (w: number) => `<div style="height:10px;width:${w}%;border-radius:5px;background:#e6e4de;margin:0 0 12px"></div>`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:14px system-ui,sans-serif;background:#f7f5f0}header{height:48px;border-bottom:1px solid #e6e4de;display:flex;align-items:center;padding:0 20px;gap:10px}main{padding:28px 20px;max-width:520px}</style></head><body><header><div style="width:18px;height:18px;border-radius:5px;background:#d8d5cc"></div>${line(12).replace("margin:0 0 12px", "margin:0")}</header><main>${line(60)}${line(90)}${line(80)}${line(70)}<div style="height:24px"></div>${line(85)}${line(55)}</main><script src="${src}" data-position="${position}"${launcher ? "" : ' data-launcher="false"'} data-open-on-load async></script></body></html>`;
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex h-8 items-center gap-1.5 border-b bg-card px-3">
        <span className="size-2 rounded-full bg-input" />
        <span className="size-2 rounded-full bg-input" />
        <span className="size-2 rounded-full bg-input" />
        <span className="ml-3 font-mono text-[11px] text-faint">your-app.com</span>
      </div>
      <iframe title="Widget preview" srcDoc={doc} className="block h-[560px] w-full bg-[#f7f5f0]" />
    </div>
  );
}
