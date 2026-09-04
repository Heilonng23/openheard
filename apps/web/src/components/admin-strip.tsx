import type { Status } from "@openheard/db/schema/feedback";
import { STATUSES } from "@openheard/db/schema/feedback";
import { Button } from "@openheard/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@openheard/ui/components/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { Input } from "@openheard/ui/components/input";
import { Textarea } from "@openheard/ui/components/textarea";
import { ArrowsMergeIcon, CaretDownIcon, PushPinIcon, TagIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { mergePosts, searchPosts, setStatus, setTags, togglePin } from "@/functions/posts";
import { STATUS_META } from "@/lib/status";
import { cn } from "@openheard/ui/lib/utils";

type Tag = { id: string; name: string };

// The dashed strip under a post: admins see it, everyone else never knows.
export function AdminStrip({
  postId,
  status,
  pinned,
  voteCount,
  tags,
  allTags,
}: {
  postId: number;
  status: Status;
  pinned: boolean;
  voteCount: number;
  tags: Tag[];
  allTags: Tag[];
}) {
  const router = useRouter();
  const [merging, setMerging] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [statusTo, setStatusTo] = useState<Status | null>(null);
  const [note, setNote] = useState("");

  async function run<T>(fn: () => Promise<T>, ok?: string) {
    try {
      await fn();
      await router.invalidate();
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work");
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-card px-3.5 py-2.5">
        <span className="mr-1 font-mono text-[11px] text-muted-foreground">admin</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <span className={cn("size-[7px] rounded-full", STATUS_META[status].dot)} />
            {STATUS_META[status].label}
            <CaretDownIcon className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-44">
            {STATUSES.map((s) => (
              <DropdownMenuItem key={s} disabled={s === status} onClick={() => setStatusTo(s)}>
                <span className={cn("size-[7px] rounded-full", STATUS_META[s].dot)} />
                {STATUS_META[s].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" onClick={() => setMerging(true)}>
          <ArrowsMergeIcon className="size-3.5" /> Merge into…
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTagging(true)}>
          <TagIcon className="size-3.5" /> Tags
        </Button>
        <Button variant="outline" size="sm" onClick={() => run(() => togglePin({ data: { postId } }))}>
          <PushPinIcon weight={pinned ? "fill" : "regular"} className="size-3.5" /> {pinned ? "Unpin" : "Pin"}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{voteCount} voters get notified on the next status change</span>
      </div>

      <Dialog open={statusTo !== null} onOpenChange={(o) => !o && setStatusTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to {statusTo ? STATUS_META[statusTo].label : ""}</DialogTitle>
            <DialogDescription>A short note shows up on the timeline and in the email to voters. Optional, but it is what people actually read.</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Started on this. Aiming for the next release." />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStatusTo(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                run(async () => {
                  await setStatus({ data: { postId, status: statusTo!, note } });
                  setStatusTo(null);
                  setNote("");
                }, "Status updated")
              }
            >
              Update status
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MergeDialog open={merging} onOpenChange={setMerging} postId={postId} onMerged={(into) => run(async () => router.navigate({ to: "/p/$id", params: { id: String(into) } }), "Merged")} />

      <Dialog open={tagging} onOpenChange={setTagging}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tags</DialogTitle>
          </DialogHeader>
          <TagPicker
            all={allTags}
            initial={tags.map((t) => t.id)}
            onSave={(ids) =>
              run(async () => {
                await setTags({ data: { postId, tags: ids } });
                setTagging(false);
              })
            }
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function TagPicker({ all, initial, onSave }: { all: Tag[]; initial: string[]; onSave: (ids: string[]) => void }) {
  const [picked, setPicked] = useState(initial);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {all.map((t) => {
          const on = picked.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setPicked((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
              className={cn("h-7 rounded-[5px] border bg-secondary px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground", on && "border-foreground/40 bg-accent text-foreground")}
            >
              {t.name}
            </button>
          );
        })}
        {all.length === 0 ? <span className="text-sm text-muted-foreground">No tags yet. Add some in settings.</span> : null}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSave(picked)}>Save</Button>
      </div>
    </div>
  );
}

export function MergeDialog({ open, onOpenChange, postId, onMerged }: { open: boolean; onOpenChange: (o: boolean) => void; postId: number; onMerged: (into: number) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: number; title: string; voteCount: number; status: Status }[]>([]);
  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(() => searchPosts({ data: { q } }).then((r) => setResults(r.filter((p) => p.id !== postId))), 150);
    return () => clearTimeout(t);
  }, [q, postId]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge into another post</DialogTitle>
          <DialogDescription>Votes are added up, one per person. Comments move over. This post keeps its URL and points at the survivor.</DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Search by title" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-col overflow-hidden rounded-md border">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{q ? "No matches" : "Type to search"}</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => mergePosts({ data: { from: postId, into: r.id } }).then(() => onMerged(r.id)).catch((e) => toast.error(e.message))}
                className="flex items-center gap-3 border-b px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-accent"
              >
                <span className={cn("size-[7px] shrink-0 rounded-full", STATUS_META[r.status].dot)} />
                <span className="flex-1 truncate">{r.title}</span>
                <span className="font-mono text-xs text-muted-foreground">{r.voteCount}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
