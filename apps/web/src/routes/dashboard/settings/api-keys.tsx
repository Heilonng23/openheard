import { Button } from "@openheard/ui/components/button";
import { CopyIcon, PlusIcon } from "@phosphor-icons/react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SectionHead } from "@/components/admin/panel";
import { createApiKey, listApiKeys, revokeApiKey } from "@/functions/settings";
import { since } from "@/lib/time";
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
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = keys.filter((k) => !k.revokedAt);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { key } = await createApiKey({ data: { name } });
      setFresh(key);
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
      <PageHead title="API keys" sub="Keys for the HTTP API, the MCP server and the CLI. Each one acts as an admin of this workspace." />

      {fresh ? (
        <div className="mb-6 flex flex-col gap-2 rounded-lg border border-status-shipped/30 bg-status-shipped/10 px-4 py-3">
          <div className="text-[13px] font-semibold">Copy this key now. It is shown once.</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-background px-2.5 py-1.5 font-mono text-[12px]">{fresh}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                navigator.clipboard.writeText(fresh).then(() => {
                  toast.success("Copied");
                  setFresh(null);
                })
              }
            >
              <CopyIcon className="size-3" /> Copy
            </Button>
          </div>
        </div>
      ) : null}

      <form onSubmit={create} className="flex items-center gap-2 pb-6">
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
            <span className="font-mono text-[11px] text-faint">{k.prefix}…</span>
          </div>
          <span className="text-xs text-faint">{k.lastUsedAt ? `used ${since(k.lastUsedAt)}` : "never used"}</span>
          <span className="text-xs text-faint">created {since(k.createdAt)}</span>
          <Button size="sm" variant="ghost" onClick={() => confirm(`Revoke "${k.name}"?`) && revokeApiKey({ data: { id: k.id } }).then(() => router.invalidate())}>
            Revoke
          </Button>
        </div>
      ))}
      <p className="pt-6 text-xs text-faint">The HTTP API itself is next on the list. Keys created now will work with it.</p>
    </>
  );
}
