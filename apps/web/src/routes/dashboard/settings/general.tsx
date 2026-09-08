import { LoadingButton } from "@openheard/ui/components/interior/loading-button";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Row, SectionHead } from "@/components/admin/panel";
import { saveWorkspace } from "@/functions/settings";
import { PageHead } from "@/routes/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings/general")({
  head: () => ({ meta: [{ title: "General · settings" }] }),
  component: General,
});

const input = "h-8 w-[280px] rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-ring/60";

function General() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const ws = root.workspace;
  const [name, setName] = useState(ws.name);
  const [tagline, setTagline] = useState(ws.tagline);
  const dirty = name !== ws.name || tagline !== ws.tagline;

  function save() {
    saveWorkspace({ data: { name, tagline, theme: ws.theme === "light" ? "light" : "dark", poweredBy: ws.poweredBy, requireApproval: ws.requireApproval, accent: ws.accent } })
      .then(() => router.invalidate())
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not save"));
  }

  return (
    <>
      <PageHead title="General" sub="What visitors see at the top of every public page." />
      <SectionHead title="Workspace" />
      <Row label="Name" help="Shown next to the logo and in the page title.">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Workspace name" className={input} />
      </Row>
      <Row label="Tagline" help="One line under the board title. Leave empty to hide.">
        <input value={tagline} onChange={(e) => setTagline(e.target.value)} aria-label="Tagline" className={input} />
      </Row>
      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <span className="text-xs text-faint">{dirty ? "Unsaved changes" : "Saved"}</span>
        <LoadingButton onAction={save} disabled={!dirty} successLabel="Saved" onError={(err) => toast.error(err instanceof Error ? err.message : "Could not save")}>
          Save
        </LoadingButton>
      </div>
    </>
  );
}
