import { Button } from "@openheard/ui/components/button";
import { CopyIcon, PlusIcon } from "@phosphor-icons/react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ClaudeLogo, CursorLogo, OpenAILogo } from "@/components/admin/agent-logos";
import { SectionHead, Toggle } from "@/components/admin/panel";
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
  const { keys, workspaceName, rootDomain } = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [limited, setLimited] = useState(false);
  const scope = limited ? "workspace" : "account";
  const [fresh, setFresh] = useState<string | null>(null);
  const [freshScope, setFreshScope] = useState<Scope>("account");
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
      <PageHead title="API keys" sub="Keys for the HTTP API, the MCP server and the CLI. A key acts as you in every workspace you administer, and can create new ones." />

      <form onSubmit={create} className="flex flex-col gap-3 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. Claude on my laptop" className="h-8 flex-1 rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-ring/60" />
          <Button size="sm" type="submit" disabled={busy || !name.trim()}>
            <PlusIcon weight="bold" className="size-3" /> Create key
          </Button>
        </div>
        <div className="flex items-center gap-2.5">
          <Toggle on={limited} onChange={setLimited} label="Limit to this workspace" />
          <span className="text-[13px] font-semibold">Limit to this workspace</span>
          <span className="text-xs text-faint">Use it for a key you share with a teammate or a script.</span>
        </div>
      </form>

      <Connect fresh={fresh} scope={fresh ? freshScope : scope} rootDomain={rootDomain} onDone={() => setFresh(null)} />

      <SectionHead title="Active keys" right={<span className="text-xs text-faint">{live.length}</span>} />
      {live.length === 0 ? <p className="border-t py-4 text-sm text-faint">No keys yet.</p> : null}
      {live.map((k) => (
        <div key={k.id} className="flex items-center gap-3 border-t py-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-semibold">{k.name}</span>
            <span className="text-[11px] text-faint">
              {k.prefix}… · {k.scope === "account" ? "All your workspaces" : `Only ${workspaceName}`}
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
      <div className={cn("max-h-36 overflow-y-auto rounded-md bg-background px-2.5 py-2 text-[12px]/5 wrap-anywhere whitespace-pre-wrap", disabled ? "text-faint" : "select-all")}>{text}</div>
    </div>
  );
}

type Agent = "claude" | "cursor" | "codex" | "other";

const AGENTS: { id: Agent; label: string; Logo: ((p: { className?: string }) => React.ReactNode) | null }[] = [
  { id: "claude", label: "Claude Code", Logo: ClaudeLogo },
  { id: "cursor", label: "Cursor", Logo: CursorLogo },
  { id: "codex", label: "Codex", Logo: OpenAILogo },
  { id: "other", label: "Other", Logo: null },
];

type Scope = "workspace" | "account";

// Keys for all workspaces connect at the root domain; a key limited to one
// workspace keeps that workspace's own address.
function apiOrigin(scope: Scope, rootDomain: string | null) {
  const { protocol, hostname, port, origin } = window.location;
  if (scope === "account" && rootDomain && hostname.endsWith("." + rootDomain)) {
    return `${rootDomain === "localhost" ? protocol : "https:"}//${rootDomain}${port ? `:${port}` : ""}`;
  }
  return origin;
}

// What an agent does once connected. Step 1 differs per agent.
function setupPrompt(connect: string, scope: Scope) {
  return `Connect openheard, our feedback board, and set it up for this project.

1. ${connect}
   If the openheard tools do not show up yet, tell me to restart you, then continue from step 2.
2. ${scope === "account" ? "Call list_workspaces. This key reaches every workspace I run. If there is more than one, ask me which to use for this project and pass it as workspace on every call; create_workspace can make a new one." : "Call get_workspace to check the connection."}
3. Set it up: ask me for our website, then match_website and apply_branding. Suggest boards and statuses and create the ones I agree to. configure_widget to match our brand. get_widget_snippet for this codebase's framework and add it once to the root layout; show me the diff.
4. Ask me before anything public or emailed, and never write this key into a committed file.`;
}

// Connecting an agent, per agent. A new key fills in here and is shown once.
function Connect({ fresh, scope, rootDomain, onDone }: { fresh: string | null; scope: Scope; rootDomain: string | null; onDone: () => void }) {
  const [agent, setAgent] = useState<Agent>("claude");
  // Set after mount: the server does not know which address the page is on.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(apiOrigin(scope, rootDomain)), [scope, rootDomain]);
  const url = `${origin}/api/mcp`;
  const key = fresh ?? "<your key>";
  const header = `Authorization: Bearer ${key}`;
  const claudeCommand = `claude mcp add --transport http openheard ${url} --header "${header}"`;
  const cursorLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=openheard&config=${origin ? btoa(JSON.stringify({ url, headers: { Authorization: `Bearer ${key}` } })) : ""}`;
  const codexConfig = `[mcp_servers.openheard]\nurl = "${url}"\nhttp_headers = { "Authorization" = "Bearer ${key}" }`;
  const off = !fresh;

  return (
    <div className={cn("mb-6 flex flex-col rounded-lg border", fresh ? "border-status-shipped/30 bg-status-shipped/5" : "bg-card")}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold">{fresh ? "Your key is ready. Copy what you need now; it is shown once." : "Connect your AI agent"}</span>
          <span className="text-xs text-muted-foreground">
            {fresh ? "Pick your agent, then paste the prompt. It connects itself and sets openheard up." : scope === "account" ? "Create a key above and it fills in here. One key reaches all your workspaces." : "Create a key above and it fills in here. This key reaches only this workspace."}
          </span>
        </div>
        {fresh ? (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Done
          </Button>
        ) : null}
      </div>

      <div className="flex gap-1 border-y px-3 py-1.5" role="tablist" aria-label="Agent">
        {AGENTS.map(({ id, label, Logo }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={agent === id}
            onClick={() => setAgent(id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
              agent === id ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Logo ? <Logo className="size-3.5" /> : null}
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 px-4 py-3.5">
        {agent === "claude" ? (
          <>
            <CopyBlock label="Send this to Claude Code" help="Paste it into a new chat in your project. Claude connects openheard and walks you through setup." text={setupPrompt(`Add the openheard MCP server: run  ${claudeCommand}`, scope)} disabled={off} />
            <CopyBlock label="Or connect it yourself" help="Run in a terminal, then restart Claude Code." text={claudeCommand} disabled={off} />
          </>
        ) : null}
        {agent === "cursor" ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold">Add to Cursor</span>
                <span className="text-xs text-muted-foreground">Opens Cursor and installs the openheard server with your key.</span>
              </div>
              <Button size="sm" disabled={off} render={off ? undefined : <a href={cursorLink} />} nativeButton={off}>
                <CursorLogo className="size-3.5" /> Add to Cursor
              </Button>
            </div>
            <CopyBlock label="Then send this to Cursor" help="Paste it into Agent chat in your project." text={setupPrompt("The openheard MCP server is installed in Cursor. Check its tools are available.", scope)} disabled={off} />
          </>
        ) : null}
        {agent === "codex" ? (
          <>
            <CopyBlock label="Add to ~/.codex/config.toml" help="Then restart Codex." text={codexConfig} disabled={off} />
            <CopyBlock label="Then send this to Codex" help="Paste it into Codex in your project." text={setupPrompt("The openheard MCP server is in ~/.codex/config.toml. Check its tools are available.", scope)} disabled={off} />
          </>
        ) : null}
        {agent === "other" ? (
          <>
            <CopyBlock label="Server URL" help="Streamable HTTP MCP server." text={url} />
            <CopyBlock label="Header" help="Send it with every request." text={header} disabled={off} />
            <CopyBlock label="Then send this to your agent" help="Any agent with MCP support." text={setupPrompt(`Add an HTTP MCP server named openheard with URL ${url} and the header ${header}`, scope)} disabled={off} />
          </>
        ) : null}
        {fresh ? <CopyBlock label="API key" help="For the HTTP API or other tools." text={fresh} /> : null}
      </div>
    </div>
  );
}
