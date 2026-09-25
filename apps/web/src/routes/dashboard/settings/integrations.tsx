import { Button } from "@openheard/ui/components/button";
import { cn } from "@openheard/ui/lib/utils";
import { CopyIcon } from "@phosphor-icons/react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SectionHead } from "@/components/admin/panel";
import { deleteIntegration, listIntegrations, saveIntegration, testIntegration } from "@/functions/integrations";
import { EVENTS, EVENT_KEYS, type IntegrationEvent, type IntegrationKind, SIGNATURE_HEADER, checkIntegrationUrl } from "@/lib/integrations";
import { since } from "@/lib/time";
import { PageHead } from "@/routes/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings/integrations")({
  loader: () => listIntegrations(),
  head: () => ({ meta: [{ title: "Integrations · settings" }] }),
  component: Integrations,
});

type Data = Awaited<ReturnType<typeof listIntegrations>>;
type Saved = Data["integrations"][number];

const COPY: Record<IntegrationKind, { title: string; help: string; placeholder: string }> = {
  slack: { title: "Slack", help: "Create an incoming webhook for the channel in Slack, then paste it here.", placeholder: "https://hooks.slack.com/services/…" },
  discord: { title: "Discord", help: "In the channel settings, open Integrations, create a webhook and copy its URL.", placeholder: "https://discord.com/api/webhooks/…" },
  webhook: { title: "Webhook", help: "Any https endpoint. We POST JSON and sign it so you can check it came from us.", placeholder: "https://example.com/hooks/openheard" },
};

function Integrations() {
  const { integrations, boards } = Route.useLoaderData();
  return (
    <>
      <PageHead title="Integrations" sub="Send new posts, comments, status changes and releases to the places your team already reads." />
      {(["slack", "discord", "webhook"] as const).map((kind) => (
        <Destination key={kind} kind={kind} saved={integrations.find((i) => i.kind === kind) ?? null} boards={boards} />
      ))}
    </>
  );
}

function Destination({ kind, saved, boards }: { kind: IntegrationKind; saved: Saved | null; boards: Data["boards"] }) {
  const router = useRouter();
  const copy = COPY[kind];
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<IntegrationEvent[]>((saved?.events as IntegrationEvent[]) ?? ["post.created", "post.status_changed"]);
  const [boardIds, setBoardIds] = useState<string[]>(saved?.boardIds ?? []);
  const [enabled, setEnabled] = useState(saved?.enabled ?? true);
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  const check = url ? checkIntegrationUrl(kind, url, { allowLocal: typeof window !== "undefined" && window.location.hostname.endsWith("localhost") }) : null;
  const urlError = check && !check.ok ? check.error : null;
  const dirty =
    !!url ||
    !saved ||
    JSON.stringify([...events].sort()) !== JSON.stringify([...saved.events].sort()) ||
    JSON.stringify([...boardIds].sort()) !== JSON.stringify([...(saved.boardIds ?? [])].sort()) ||
    enabled !== saved.enabled;

  const toggleEvent = (e: IntegrationEvent) => setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : EVENT_KEYS.filter((k) => k === e || cur.includes(k))));
  const toggleBoard = (id: string) => setBoardIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function run(kindOfWork: "save" | "test" | "remove", work: () => Promise<void>) {
    setBusy(kindOfWork);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", async () => {
      const res = await saveIntegration({ data: { kind, url, events, boardIds: boardIds.length ? boardIds : null, enabled } });
      if (res.secret) setSecret(res.secret);
      setUrl("");
      toast.success(`${copy.title} saved`);
      await router.invalidate();
    });

  const test = () =>
    run("test", async () => {
      const res = await testIntegration({ data: { kind, url } });
      if (res.ok) toast.success("Test message delivered");
      else toast.error(`Test failed: ${res.error}`);
      await router.invalidate();
    });

  const remove = () =>
    confirm(`Disconnect ${copy.title}?`) &&
    run("remove", async () => {
      await deleteIntegration({ data: { kind } });
      setSecret(null);
      setUrl("");
      await router.invalidate();
    });

  return (
    <section className="pb-9" aria-labelledby={`int-${kind}`}>
      <SectionHead title={copy.title} right={<DeliveryStatus saved={saved} />} />
      <div className="flex flex-col gap-4 border-t pt-4">
        <p id={`int-${kind}`} className="text-[13px] text-muted-foreground">
          {copy.help}
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Webhook URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={saved ? `Saved, ending in ${saved.urlHint}. Paste a new URL to replace it.` : copy.placeholder}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!urlError}
            className={cn("h-8 rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none placeholder:text-[13px] placeholder:text-faint focus:border-ring/60", urlError && "border-destructive/60")}
          />
          {urlError ? <span className="text-xs text-destructive">{urlError}</span> : null}
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="pb-1.5 text-xs font-semibold text-muted-foreground">Send when</legend>
          <div className="flex flex-wrap gap-1.5">
            {EVENTS.map((e) => (
              <Chip key={e.key} on={events.includes(e.key)} onClick={() => toggleEvent(e.key)}>
                {e.label}
              </Chip>
            ))}
          </div>
        </fieldset>

        {boards.length > 1 ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="pb-1.5 text-xs font-semibold text-muted-foreground">Boards</legend>
            <div className="flex flex-wrap gap-1.5">
              <Chip on={boardIds.length === 0} onClick={() => setBoardIds([])}>
                All boards
              </Chip>
              {boards.map((b) => (
                <Chip key={b.id} on={boardIds.includes(b.id)} onClick={() => toggleBoard(b.id)}>
                  {b.name}
                </Chip>
              ))}
            </div>
            <span className="text-xs text-faint">Changelog releases are sent whatever boards you pick.</span>
          </fieldset>
        ) : null}

        {kind === "webhook" && secret ? (
          <div className="flex flex-col gap-2 rounded-lg border border-status-shipped/30 bg-status-shipped/10 px-4 py-3">
            <div className="text-[13px] font-semibold">Copy the signing secret now. It is shown once.</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-background px-2.5 py-1.5 font-mono text-[12px]">{secret}</code>
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(secret).then(() => toast.success("Copied"))}>
                <CopyIcon className="size-3" /> Copy
              </Button>
            </div>
          </div>
        ) : null}
        {kind === "webhook" && saved?.signed ? (
          <p className="text-xs text-faint">
            Each request carries <code className="font-mono text-[11px] text-muted-foreground">{SIGNATURE_HEADER}: t=…,v1=…</code>, an HMAC-SHA256 of <code className="font-mono text-[11px] text-muted-foreground">t.body</code> with your secret.
          </p>
        ) : null}

        <div className="flex items-center gap-2 pt-1">
          {saved ? (
            <label className="mr-auto flex items-center gap-2 text-[13px] text-muted-foreground">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-3.5 accent-[var(--link)]" />
              Sending on
            </label>
          ) : (
            <span className="mr-auto" />
          )}
          {saved ? (
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy !== null}>
              Disconnect
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={test} disabled={busy !== null || !!urlError || (!url && !saved)}>
            {busy === "test" ? "Sending…" : "Send test"}
          </Button>
          <Button size="sm" arrow onClick={save} disabled={busy !== null || !!urlError || (!saved && !url) || !dirty || events.length === 0}>
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors duration-150", on ? "border-input bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}
    >
      <span aria-hidden className={cn("size-[5px] rounded-full", on ? "bg-link" : "bg-faint/60")} />
      {children}
    </button>
  );
}

function DeliveryStatus({ saved }: { saved: Saved | null }) {
  if (!saved) return <span className="text-xs text-faint">Not connected</span>;
  if (!saved.enabled) return <span className="text-xs text-faint">Paused</span>;
  if (!saved.lastStatus || !saved.lastAt) return <span className="text-xs text-faint">Connected, nothing sent yet</span>;
  const ok = saved.lastStatus === "ok";
  return (
    <span className="flex max-w-[60%] items-center gap-1.5 text-xs text-faint" title={saved.lastError ?? undefined}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", ok ? "bg-status-shipped" : "bg-destructive")} />
      <span className="truncate tabular-nums">{ok ? `Delivered ${since(saved.lastAt)}` : `Failed ${since(saved.lastAt)}: ${saved.lastError ?? "unknown error"}`}</span>
    </span>
  );
}
