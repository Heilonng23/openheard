import { Button } from "@openheard/ui/components/button";
import { Input } from "@openheard/ui/components/input";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { createFileRoute, redirect, useLoaderData, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Mono, TagChip } from "@/components/bits";
import { getUser } from "@/functions/get-user";
import { deleteBoard, deleteTag, saveBoard, saveTag, saveWorkspace } from "@/functions/settings";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    const user = await getUser();
    if (user?.role !== "admin") throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Settings · feedback" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const ws = root.workspace;
  const [form, setForm] = useState({ name: ws.name, tagline: ws.tagline, theme: ws.theme === "light" ? "light" : ("dark" as "dark" | "light"), poweredBy: ws.poweredBy, requireApproval: ws.requireApproval });
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify({ name: ws.name, tagline: ws.tagline, theme: ws.theme === "light" ? "light" : "dark", poweredBy: ws.poweredBy, requireApproval: ws.requireApproval });

  async function run<T>(fn: () => Promise<T>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      await router.invalidate();
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-[1100px] flex-1 grid-cols-1 gap-10 px-5 py-8 md:grid-cols-[200px_minmax(0,1fr)] md:px-10">
      <aside className="flex flex-col gap-0.5 text-[13.5px] md:sticky md:top-6 md:self-start">
        <div className="px-2.5 pb-2 font-mono text-[11px] text-muted-foreground">Settings</div>
        {[
          ["workspace", "Workspace"],
          ["boards", "Boards"],
          ["tags", "Tags"],
          ["team", "Team"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-md px-2.5 py-[7px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
            {label}
          </a>
        ))}
      </aside>

      <div className="flex flex-col gap-12">
        <section id="workspace" className="flex flex-col">
          <h1 className="mb-3 text-[22px] font-semibold">Workspace</h1>
          <Row label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="max-w-sm" />
          </Row>
          <Row label="Tagline" help="Sits under the board title. One sentence.">
            <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className="max-w-md" />
          </Row>
          <Row label="Theme">
            <div className="flex w-max gap-0.5 rounded-md border bg-card p-[3px]">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, theme: t })}
                  className={cn("rounded-[5px] px-3 py-1 text-xs font-medium capitalize text-muted-foreground transition-colors", form.theme === t && "bg-accent text-foreground")}
                >
                  {t}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Who can post">
            <div className="flex flex-col gap-2.5 text-[13.5px]">
              <Toggle on={!form.requireApproval} onChange={(v) => setForm({ ...form, requireApproval: !v })} label="Posts go live immediately" />
            </div>
          </Row>
          <Row label="Powered by" help="Free to turn off. It is how other people find the project.">
            <Toggle on={form.poweredBy} onChange={(v) => setForm({ ...form, poweredBy: v })} label='Show "Powered by openheard" in the footer' />
          </Row>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" disabled={!dirty || busy} onClick={() => setForm({ name: ws.name, tagline: ws.tagline, theme: ws.theme === "light" ? "light" : "dark", poweredBy: ws.poweredBy, requireApproval: ws.requireApproval })}>
              Discard
            </Button>
            <Button disabled={!dirty || busy} onClick={() => run(() => saveWorkspace({ data: form }), "Saved")}>
              Save changes
            </Button>
          </div>
        </section>

        <section id="boards" className="flex flex-col">
          <h2 className="mb-1 text-lg font-semibold">Boards</h2>
          <p className="mb-4 text-sm text-muted-foreground">Feature requests, bugs, integrations. Keep it to what people actually sort by.</p>
          <div className="overflow-hidden rounded-lg border bg-card">
            {root.boards.map((b) => (
              <BoardRow key={b.id} board={b} onSave={(name, description) => run(() => saveBoard({ data: { id: b.id, name, description } }), "Board updated")} onDelete={() => confirm(`Delete "${b.name}"?`) && run(() => deleteBoard({ data: { id: b.id } }), "Board deleted")} />
            ))}
            <NewBoard onCreate={(name, description) => run(() => saveBoard({ data: { name, description } }), "Board added")} />
          </div>
        </section>

        <section id="tags" className="flex flex-col">
          <h2 className="mb-1 text-lg font-semibold">Tags</h2>
          <p className="mb-4 text-sm text-muted-foreground">Cross-cutting labels. Admins apply them from a post.</p>
          <div className="flex flex-wrap items-center gap-2">
            {root.tags.map((t) => (
              <span key={t.id} className="group inline-flex items-center gap-1">
                <TagChip className="h-7 px-2.5 text-xs">{t.name}</TagChip>
                <button type="button" title="Delete tag" onClick={() => run(() => deleteTag({ data: { id: t.id } }))} className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground">
                  <TrashIcon className="size-3.5" />
                </button>
              </span>
            ))}
            <NewTag onCreate={(name) => run(() => saveTag({ data: { name } }))} />
          </div>
        </section>

        <section id="team" className="flex flex-col">
          <h2 className="mb-1 text-lg font-semibold">Team</h2>
          <p className="text-sm text-muted-foreground">
            You are the admin. Inviting more admins and per-board moderators is on the roadmap. <Mono>#2</Mono>
          </p>
        </section>
      </div>
    </main>
  );
}

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-t py-5 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold">{label}</span>
        {help ? <span className="text-xs leading-snug text-muted-foreground">{help}</span> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px]">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn("inline-flex h-5 w-[34px] items-center rounded-full p-0.5 transition-colors duration-150", on ? "justify-end bg-primary" : "justify-start bg-accent")}
      >
        <span className={cn("size-4 rounded-full transition-colors", on ? "bg-primary-foreground" : "bg-muted-foreground")} />
      </button>
      {label}
    </label>
  );
}

function BoardRow({ board, onSave, onDelete }: { board: { id: string; name: string; description: string | null; count: number }; onSave: (name: string, description: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? "");
  const dirty = name !== board.name || description !== (board.description ?? "");
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
      <Input value={description} placeholder="Description" onChange={(e) => setDescription(e.target.value)} className="h-8" />
      <div className="flex items-center gap-1">
        <Mono className="mr-2 w-8 text-right">{board.count}</Mono>
        <Button size="sm" variant={dirty ? "default" : "ghost"} disabled={!dirty || name.trim().length === 0} onClick={() => onSave(name, description)}>
          Save
        </Button>
        <Button size="icon-sm" variant="ghost" title="Delete board" onClick={onDelete}>
          <TrashIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function NewBoard({ onCreate }: { onCreate: (name: string, description: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate(name, description);
        setName("");
        setDescription("");
      }}
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-3 bg-accent/30 px-3 py-2.5"
    >
      <Input value={name} placeholder="New board" onChange={(e) => setName(e.target.value)} className="h-8" />
      <Input value={description} placeholder="Description" onChange={(e) => setDescription(e.target.value)} className="h-8" />
      <Button size="sm" type="submit" variant="outline" disabled={name.trim().length === 0}>
        <PlusIcon weight="bold" className="size-3" /> Add
      </Button>
    </form>
  );
}

function NewTag({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
        setName("");
      }}
      className="flex items-center gap-1.5"
    >
      <Input value={name} placeholder="New tag" onChange={(e) => setName(e.target.value)} className="h-7 w-32 text-xs" />
      <Button size="sm" type="submit" variant="outline" disabled={name.trim().length === 0}>
        <PlusIcon weight="bold" className="size-3" /> Add
      </Button>
    </form>
  );
}
