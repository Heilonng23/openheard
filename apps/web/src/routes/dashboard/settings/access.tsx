import { Button } from "@openheard/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { CaretDownIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Row, SectionHead, Toggle } from "@/components/admin/panel";
import { saveWorkspace } from "@/functions/settings";
import { PageHead } from "@/routes/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings/access")({
  head: () => ({ meta: [{ title: "Access · settings" }] }),
  component: Access,
});

function Access() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const ws = root.workspace;
  const [form, setForm] = useState({ whoCanPost: ws.whoCanPost, anonymousVoting: ws.anonymousVoting, requireApproval: ws.requireApproval, showRoadmap: ws.showRoadmap, showChangelog: ws.showChangelog });
  const [busy, setBusy] = useState(false);
  const dirty = Object.entries(form).some(([k, v]) => (ws as Record<string, unknown>)[k] !== v);

  async function save() {
    setBusy(true);
    try {
      await saveWorkspace({ data: { name: ws.name, tagline: ws.tagline, theme: ws.theme === "light" ? "light" : "dark", poweredBy: ws.poweredBy, accent: ws.accent, ...form } });
      await router.invalidate();
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Access" sub="Who can do what on the public board." />
      <SectionHead title="Posting" />
      <Row label="Who can post" help="Members are people on the Team page. Anyone means any signed-in user.">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-[30px] items-center gap-2 rounded-md border border-input bg-card pr-2 pl-2.5 text-[13px] outline-none hover:bg-accent">
            {form.whoCanPost === "anyone" ? "Anyone signed in" : "Team members only"} <CaretDownIcon className="size-2.5 text-faint" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onClick={() => setForm({ ...form, whoCanPost: "anyone" })}>Anyone signed in</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setForm({ ...form, whoCanPost: "members" })}>Team members only</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Row>
      <Row label="Require approval" help="New posts stay hidden until an admin approves them.">
        <Toggle on={form.requireApproval} onChange={(v) => setForm({ ...form, requireApproval: v })} label="Require approval" />
      </Row>
      <Row label="Anonymous voting" help="Visitors vote once per browser and can claim it when they sign in. Lands with the next release.">
        <Toggle on={form.anonymousVoting} onChange={(v) => setForm({ ...form, anonymousVoting: v })} label="Anonymous voting" />
      </Row>
      <div className="pt-7">
        <SectionHead title="Public tabs" />
      </div>
      <Row label="Roadmap" help="Hide it if you do not want to promise order.">
        <Toggle on={form.showRoadmap} onChange={(v) => setForm({ ...form, showRoadmap: v })} label="Show roadmap" />
      </Row>
      <Row label="Changelog" help="Hide it until you have shipped something.">
        <Toggle on={form.showChangelog} onChange={(v) => setForm({ ...form, showChangelog: v })} label="Show changelog" />
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
