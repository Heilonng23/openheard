import { Button } from "@openheard/ui/components/button";
import { CopyIcon, PlusIcon } from "@phosphor-icons/react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SectionHead } from "@/components/admin/panel";
import { createApiKey, listApiKeys, revokeApiKey } from "@/functions/settings";
import { since } from "@/lib/time";
import { cn } from "@openheard/ui/lib/utils";
import { PageHead } from "@/routes/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings/api-keys")({
  loader: () => listApiKeys(),
  head: () => ({ meta: [{ title: "API keys · settings" }] }),
  component: ApiKeys,
});

function ApiKeys() {
  const keys = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"workspace" | "account">("workspace");
  const [fresh, setFresh] = useState<string | null>(null);
  const [freshScope, setFreshScope] = useState<"workspace" | "account">("workspace");
  const [busy, setBusy] = useState(false);
  const live = keys.filter((k) => !k.revokedAt);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { key } = await createApiKey({ data: { name, scope } });
      setFresh(key);
      setFreshScope(scope);
      setName("");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="API keys" sub="Keys for the HTTP API, the MCP server and the CLI. A workspace key acts as an admin of this workspace only. An account key acts as you in every workspace you administer, and can create new ones." />

      <Connect fresh={fresh} scope={freshScope} onDone={() => setFresh(null)} />

      <form onSubmit={create} className="flex flex-wrap items-center gap-2 pb-6">
        <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border bg-card p-0.5" role="radiogroup" aria-label="Key type">
          {(
            [
              ["workspace", "Workspace key"],
              ["account", "Account key"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={scope === v}
              onClick={() => setScope(v)}
              className={cn("inline-flex h-full items-center rounded-md px-2.5 text-xs transition-colors", scope === v ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. Claude on my laptop" className="h-8 flex-1 rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-ring/60" />
        <Button size="sm" type="submit" disabled={busy || !name.trim()}>
          <PlusIcon weight="bold" className="size-3" /> Create key
        </Button>
      </form>

      <SectionHead title="Active keys" right={<span className="text-xs text-faint">{live.length}</span>} />
      {live.length === 0 ? <p className="border-t py-4 text-sm text-faint">No keys yet.</p> : null}
      {live.map((k) => (
        <div key={k.id} className="flex items-center gap-3 border-t py-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-semibold">{k.name}</span>
            <span className="text-[11px] text-faint">
              {k.prefix}… · {k.scope === "account" ? "account key" : "workspace key"}
            </span>
          </div>
          <span className="text-xs text-faint">{k.lastUsedAt ? `used ${since(k.lastUsedAt)}` : "never used"}</span>
          <span className="text-xs text-faint">created {since(k.createdAt)}</span>
          <Button size="sm" variant="ghost" onClick={() => confirm(`Revoke "${k.name}"?`) && revokeApiKey({ data: { id: k.id } }).then(() => router.invalidate())}>
            Revoke
          </Button>
        </div>
      ))}
      <p className="pt-6 pb-8 text-xs text-faint">Send a key as a Bearer token to call the HTTP API or connect the MCP server at /api/mcp.</p>
    </>
  );
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Could not copy. Select the text and copy it by hand."),
  );
}

function CopyBlock({ label, help, text, disabled }: { label: string; help: string; text: string; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold">{label}</span>
          <span className="text-xs text-muted-foreground">{help}</span>
        </div>
        <Button size="sm" variant="secondary" onClick={() => copy(text)} disabled={disabled}>
          <CopyIcon className="size-3" /> Copy
        </Button>
      </div>
      <div className={cn("max-h-40 overflow-y-auto rounded-md bg-background px-2.5 py-2 text-[12px]/5 break-all whitespace-pre-wrap", disabled ? "text-faint" : "select-all")}>{text}</div>
    </div>
  );
}

// The key, the one command that connects Claude Code, and a prompt to hand
// any agent that sets it all up. A new key fills in here and is shown once.
function Connect({ fresh, scope, onDone }: { fresh: string | null; scope: "workspace" | "account"; onDone: () => void }) {
  const url = `${typeof window === "undefined" ? "" : window.location.origin}/api/mcp`;
  const key = fresh ?? "<paste your key>";
  const command = `claude mcp add --transport http openheard ${url} --header "Authorization: Bearer ${key}"`;
  const prompt = `Connect openheard, our feedback board, and set it up for this project.

1. Add the openheard MCP server.
   Claude Code: run  ${command}
   Cursor or another agent: add an HTTP MCP server with URL ${url} and the header Authorization: Bearer ${key}
   If the openheard tools do not show up yet, tell me to restart you, then continue from step 2.
2. Call get_workspace to check the connection${scope === "account" ? " (this is an account key: list_workspaces shows every board I run, and create_workspace can make a new one)" : ""}.
3. Set it up: ask me for our website, then match_website and apply_branding. Suggest boards and statuses and create the ones I agree to. configure_widget to match our brand. get_widget_snippet for this codebase's framework and add it once to the root layout; show me the diff.
4. Ask me before anything public or emailed, and never write this key into a committed file.`;
  return (
    <div className={cn("mb-6 flex flex-col gap-4 rounded-lg border px-4 py-3.5", fresh ? "border-status-shipped/30 bg-status-shipped/10" : "bg-card")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold">{fresh ? "Your key is ready. Copy what you need now; it is shown once." : "Connect your AI agent"}</span>
          {fresh ? null : <span className="text-xs text-muted-foreground">Create a key below and it fills in here. Pick Account key to let the agent run all your workspaces.</span>}
        </div>
        {fresh ? (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Done
          </Button>
        ) : null}
      </div>
      <CopyBlock label="Send this to your agent" help="Paste it into Claude Code, Cursor or any agent. It connects itself and sets openheard up." text={prompt} disabled={!fresh} />
      <CopyBlock label="Or connect Claude Code yourself" help="Run it in a terminal, then restart Claude Code." text={command} disabled={!fresh} />
      {fresh ? <CopyBlock label="API key" help="For the HTTP API or other tools." text={fresh} /> : null}
    </div>
  );
}
