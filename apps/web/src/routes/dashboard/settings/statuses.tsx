import { STATUS_KINDS } from "@openheard/db/schema/feedback";
import type { StatusKind } from "@openheard/db/schema/feedback";
import { Button } from "@openheard/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { CaretDownIcon, CaretUpIcon, CheckIcon, DotsThreeIcon, PlusIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SectionHead, Toggle } from "@/components/admin/panel";
import { deleteStatus, reorderStatuses, saveStatus } from "@/functions/statuses";
import { KIND_LABEL } from "@/lib/status";
import type { StatusInfo } from "@/lib/status";
import { PageHead } from "@/routes/dashboard/settings";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/dashboard/settings/statuses")({
  head: () => ({ meta: [{ title: "Statuses · settings" }] }),
  component: Statuses,
});

const SWATCHES = ["#f2b53d", "#b08cff", "#6e8bff", "#3ecf8e", "#e0705f", "#5fc8e0", "#ff8fab", "#7a7a85"];

function Statuses() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  function fire<T>(fn: () => Promise<T>, ok?: string) {
    if (ok) toast.success(ok);
    fn()
      .then(() => router.invalidate())
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "That did not work");
        router.invalidate();
      });
  }

  function move(key: string, dir: -1 | 1) {
    const keys = root.statuses.map((s) => s.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j]!, keys[i]!];
    fire(() => reorderStatuses({ data: { keys } }));
  }

  return (
    <>
      <PageHead title="Statuses" sub="Where a post can be. The order here is the order on the roadmap and the timeline." />
      <SectionHead
        title="Statuses"
        right={
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <PlusIcon weight="bold" className="size-3" /> New status
          </Button>
        }
      />
      {root.statuses.map((s, i) => (
        <StatusRow
          key={s.key}
          status={s}
          count={root.statusCounts[s.key] ?? 0}
          first={i === 0}
          last={i === root.statuses.length - 1}
          onMove={(d) => move(s.key, d)}
          onSave={(patch) => fire(() => saveStatus({ data: { key: s.key, ...patch } }), "Saved")}
          onDelete={() => confirm(`Delete "${s.label}"?`) && fire(() => deleteStatus({ data: { key: s.key } }), "Status deleted")}
        />
      ))}
      {adding ? (
        <StatusRow
          status={{ key: "", label: "", color: "#6e8bff", kind: "planned", position: 99, onRoadmap: true }}
          count={0}
          editing
          onSave={(patch) => { fire(() => saveStatus({ data: patch }), "Status added"); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      <p className="pt-4 text-xs text-faint">Each status has a kind that tells openheard what it means. New posts land in the first "open" kind, merges go to "closed", shipping from the changelog uses "done".</p>
    </>
  );
}

type Patch = { label: string; color: string; kind: StatusKind; onRoadmap: boolean };

function StatusRow({
  status,
  count,
  first,
  last,
  editing: initialEditing,
  onMove,
  onSave,
  onDelete,
  onCancel,
}: {
  status: StatusInfo;
  count: number;
  first?: boolean;
  last?: boolean;
  editing?: boolean;
  onMove?: (d: -1 | 1) => void;
  onSave: (p: Patch) => void;
  onDelete?: () => void;
  onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(!!initialEditing);
  const [label, setLabel] = useState(status.label);
  const [color, setColor] = useState(status.color);
  const [kind, setKind] = useState<StatusKind>(status.kind);
  const [onRoadmap, setOnRoadmap] = useState(status.onRoadmap);

  if (editing) {
    return (
      <form
        className="flex flex-col gap-3 border-t py-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ label, color, kind, onRoadmap });
          if (!initialEditing) setEditing(false);
        }}
      >
        <div className="flex items-center gap-2">
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="h-8 w-48 rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-ring/60" />
          <span className="flex gap-1.5">
            {SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} className={cn("inline-flex size-[22px] items-center justify-center rounded-full", color === c && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ background: c }}>
                {color === c ? <CheckIcon weight="bold" className="size-2.5 text-[#0d0d0f]" /> : null}
              </button>
            ))}
          </span>
          <input value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-24 rounded-lg border border-input bg-card px-2.5 font-mono text-[12px] outline-none focus:border-ring/60" />
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-2 rounded-lg border border-input bg-card pr-2 pl-2.5 text-[13px] outline-none hover:bg-accent">
              <span className="text-faint">kind</span> {kind} <CaretDownIcon className="size-2.5 text-faint" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-64">
              {STATUS_KINDS.map((k) => (
                <DropdownMenuItem key={k} onClick={() => setKind(k)}>
                  <span className="w-16 font-semibold">{k}</span>
                  <span className="text-xs text-muted-foreground">{KIND_LABEL[k]}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <label className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
            <Toggle on={onRoadmap} onChange={setOnRoadmap} label="Show on roadmap" /> Show on roadmap
          </label>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" type="button" onClick={() => (onCancel ? onCancel() : setEditing(false))}>
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={!label.trim()}>
            Save
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 border-t py-2.5">
      <span className="flex flex-col">
        <button type="button" disabled={first} onClick={() => onMove?.(-1)} className="text-faint hover:text-foreground disabled:opacity-30">
          <CaretUpIcon className="size-3" />
        </button>
        <button type="button" disabled={last} onClick={() => onMove?.(1)} className="text-faint hover:text-foreground disabled:opacity-30">
          <CaretDownIcon className="size-3" />
        </button>
      </span>
      <span className="size-2.5 rounded-full" style={{ background: status.color }} />
      <span className="w-40 text-[13px] font-semibold">{status.label}</span>
      <span className="font-mono text-[11px] text-faint">{status.kind}</span>
      {status.onRoadmap ? <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-faint">roadmap</span> : null}
      <span className="flex-1" />
      <span className="text-xs text-faint tabular-nums">
        {count} {count === 1 ? "post" : "posts"}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex size-[26px] items-center justify-center rounded-md text-faint outline-none hover:bg-accent hover:text-foreground">
          <DotsThreeIcon weight="bold" className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-32">
          <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
