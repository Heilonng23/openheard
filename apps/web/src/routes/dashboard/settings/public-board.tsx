import { Button } from "@openheard/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { CaretDownIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Row, SectionHead, Toggle } from "@/components/admin/panel";
import { saveWorkspace } from "@/functions/settings";
import { PageHead } from "@/routes/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings/public-board")({
  head: () => ({ meta: [{ title: "Public board · settings" }] }),
  component: PublicBoard,
});

function PublicBoard() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const ws = root.workspace;
  const [theme, setTheme] = useState<"dark" | "light">(ws.theme === "light" ? "light" : "dark");
  const [poweredBy, setPoweredBy] = useState(ws.poweredBy);
  const [busy, setBusy] = useState(false);
  const dirty = theme !== (ws.theme === "light" ? "light" : "dark") || poweredBy !== ws.poweredBy;

  async function save() {
    setBusy(true);
    try {
      await saveWorkspace({ data: { name: ws.name, tagline: ws.tagline, theme, poweredBy, requireApproval: ws.requireApproval, accent: ws.accent } });
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
      <PageHead title="Public board" sub="How the board behaves for visitors." />
      <SectionHead title="Appearance" />
      <Row label="Theme" help="Auto follows the visitor's system setting.">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-[30px] items-center gap-2 rounded-md border border-input bg-card pr-2 pl-2.5 text-[13px] capitalize outline-none hover:bg-accent">
            {theme} <CaretDownIcon className="size-2.5 text-faint" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-32">
            {(["dark", "light"] as const).map((t) => (
              <DropdownMenuItem key={t} className="capitalize" onClick={() => setTheme(t)}>
                {t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Row>
      <div className="pt-7">
        <SectionHead title="Footer" />
      </div>
      <Row label="Powered by openheard" help="Small credit in the footer.">
        <Toggle on={poweredBy} onChange={setPoweredBy} label="Powered by" />
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
